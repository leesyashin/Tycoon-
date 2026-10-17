import { BALANCE } from '@data/balance';
import { getLocationDef } from '@data/locations';
import { getGradeDef } from '@data/matcha';
import { PRODUCT_LINES, REGISTER_ID, SERVING_STATION_ID, getStationDef } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';
import { DEMAND_CURVE, TIME } from '@data/time';
import { BOOST_RULES } from '@data/leaves';
import { Decimal, D, ZERO } from '../math/bignum';
import { getLocation, type GameState, type LocationState } from '../GameState';
import { collectModifiers } from '../economy/modifiers';
import { getItemPrice, getStationSpeed, menuTier } from '../economy/stations';
import { getStaffLevel } from '../staff/effects';
import { gradeInUse } from '../supply/stock';
import { hourOf, isOpenHour } from '../time/clock';
import {
  attachMult,
  customerTypeShares,
  influencerHypeMult,
  regularTipMult,
  tipSatisfactionTerm,
} from './types';

export interface SatisfactionBreakdown {
  base: number;
  decor: number;
  /** Matcha-Sorte im Ausschank. */
  quality: number;
  /** Meta-Upgrade „Basis-Zufriedenheit“ (Zen). */
  zen: number;
  /** Laufende Events (Hanami +10). */
  event: number;
  waitPressure: number;
  cleanliness: number;
  /** Bedienung am Tisch (anteilig, so viele Gäste die Bedienungen schaffen). */
  tableService: number;
  /** Matcha ausverkauft. */
  matcha: number;
  target: number;
}

/** Stufen der Service-Pipeline (GAME_DESIGN § 7.2); `demand` ist die Nachfrage selbst, `service` der Tischservice. */
export type StageId = 'demand' | 'order' | 'production' | 'service';
export const STAGES: readonly StageId[] = ['demand', 'order', 'production', 'service'];

/** Alle Raten eines Cafés zu einer Tagesstunde, pro Spielstunde (GAME_DESIGN § 7, § 14). */
export interface LocationRates {
  /** Stunde 0..23, für die gerechnet wurde, und ob das Café da geöffnet hat. */
  hour: number;
  open: boolean;
  /** Gäste/h, die kommen wollen (Tageskurve × Anziehung des Cafés), vor dem Platz-Deckel. */
  demand: number;
  /** Gäste/h, die das Café fasst (Mitnahme an der Theke + Tische). */
  capacity: number;
  /** Gäste/h, die hereinkommen (Nachfrage, höchstens so viele, wie Platz ist). */
  spawnRate: number;
  /** Kleinste Kapazität von Bestellung und Zubereitung (Gäste/h). */
  totalThroughput: number;
  /** Bediente Gäste/h. */
  served: number;
  /** Umsatz/h inklusive Trinkgeld und Boosts (landet über die Kasse im Geld). */
  incomePerHour: Decimal;
  /** Davon Trinkgeld. */
  tipsPerHour: Decimal;
  /** Wareneinsatz/h (Milch, Becher, Teig, Kuchen …; Matcha kommt aus dem Lager). */
  goodsPerHour: Decimal;
  /** Löhne/h (nur geöffnet). */
  wagesPerHour: Decimal;
  /** Miete und Nebenkosten/h (Miete rund um die Uhr, Strom geöffnet). */
  rentPerHour: Decimal;
  /** Matcha-Verbrauch in Gramm/h. */
  matchaGramsPerHour: number;
  waitPressure: number;
  satisfactionFactor: number;
  tipRate: number;
  /** Erwarteter Spawn-Faktor aus Influencer-Hype (GAME_DESIGN § 7.5), schon in `spawnRate` enthalten. */
  influencerHypeMult: number;
  satisfaction: SatisfactionBreakdown;
  /** Kapazität je Stufe in Gästen/h (`demand` = Nachfrage, `service` = Gäste, die Bedienungen schaffen). */
  stages: Record<StageId, number>;
  /** Stufe, die gerade bremst (`demand`: alle Gäste werden bedient). */
  bottleneck: StageId;
  /** Barista-Minuten je Gast (Warenkorb, § 4), ohne Übergabe. */
  loadPerCustomer: number;
  /** Durchschnittliche Servicezeit der Bedienungen je Gast (Übergabe/Tischservice gemischt). */
  avgServeTime: number;
  /** Anteil der Gäste, die eine Bedienung bekommen (der Rest holt an der Theke ab). */
  tableServiceShare: number;
  /** Durchschnittlicher Bon je Gast (ohne Trinkgeld und Boosts). */
  avgTicket: Decimal;
  /** Sorte im Ausschank (−1 = kein Matcha mehr) und wie sie wirkt (Lieferengpass zieht ab). */
  grade: number;
  effectiveGrade: number;
  /** Bestellte Stück/h je Produktlinie. */
  perStation: Record<string, number>;
  /** Umsatz/h je Produktlinie (inkl. Trinkgeld und Boosts); Summe = `incomePerHour`. */
  perStationIncome: Record<string, Decimal>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function satisfactionFactor(satisfaction: number): number {
  return BALANCE.satisfaction.factorBase + satisfaction / 100;
}

/** Trinkgeld-Quote aus Zufriedenheit und Musik, inkl. Kundentypen (Stammgast +10 %, Kritiker doppelt). */
export function tipRate(loc: LocationState, locationId = 'berlin'): number {
  const t = BALANCE.tips;
  const shares = customerTypeShares(locationId);
  const base =
    tipSatisfactionTerm(loc.satisfaction, shares.critic) * t.satisfactionFactor +
    (loc.ambience['music'] ?? 0) * t.perMusicLevel;
  return base * regularTipMult(shares.regular);
}

/** Follower bringen Gäste: × (1 + max × F / (F + half)), sättigt bei vielen Followern. */
export function followerDemandMult(followers: number): number {
  const f = BALANCE.demand.followers;
  const n = Math.max(0, followers);
  return 1 + (f.max * n) / (n + f.half);
}

/** Tische drinnen (`seats`) plus draußen (Terrassen-Stufe). */
export function tableCount(loc: LocationState): number {
  const terrace = loc.ambience['terrace'] ?? 0;
  const out = BALANCE.capacity.terraceTables[terrace] ?? 0;
  return (loc.ambience['seats'] ?? 0) + out;
}

/** Gäste/h, die das Café fasst: Mitnahme an der Theke + je Tisch zwei Plätze. */
export function capacityPerHour(loc: LocationState): number {
  const c = BALANCE.capacity;
  return c.takeawayPerHour + tableCount(loc) * c.perTablePerHour;
}

/** Durchschnittliche Servicezeit einer Bedienung je Gast (Übergabe an der Ausgabe oder Tischservice, § 7.2). */
export function averageServeTime(): number {
  const s = BALANCE.service;
  return (1 - s.dineInShare) * s.handoverMin + s.dineInShare * s.tableServiceMin;
}

/** Bestellungen/h, die die Kasse schafft: Verkäufer × Kassen-Tempo / Bestellzeit. */
export function orderCapacity(loc: LocationState, speedBoost = 1): number {
  const register = getStationDef(REGISTER_ID);
  const speed = getStationSpeed(register, loc.stations[REGISTER_ID]?.level ?? 0);
  return (getStaffLevel(loc, 'cashier') * speed * speedBoost * 60) / BALANCE.order.orderMin;
}

/** Gäste/h, die die Bedienungen schaffen: Bedienungen × Tempo der Ausgabe-Station / Ø Servicezeit. */
export function serviceCapacity(loc: LocationState, speedBoost = 1): number {
  const serving = getStationDef(SERVING_STATION_ID);
  const speed = getStationSpeed(serving, loc.stations[SERVING_STATION_ID]?.level ?? 0);
  return (getStaffLevel(loc, 'waiter') * speed * speedBoost * 60) / averageServeTime();
}

/**
 * Gäste/h, die die Baristas schaffen. Ohne Bedienung rufen sie zusätzlich auf und reichen über die Theke
 * (`pickupMin` je Gast); Bedienungen nehmen ihnen das bis zu ihrer Kapazität ab.
 */
export function productionCapacity(
  baristaMinPerHour: number,
  load: number,
  waiterCap: number,
): number {
  if (load <= 0) return 0;
  const pickup = BALANCE.service.pickupMin;
  const all = baristaMinPerHour / load;
  if (all <= waiterCap) return all;
  return (baristaMinPerHour + waiterCap * pickup) / (load + pickup);
}

/** Bezahlte Köpfe einer Rolle (du an der Kasse bekommst keinen Lohn). */
export function paidHeads(loc: LocationState, roleId: string): number {
  const def = STAFF_ROLES.find((r) => r.id === roleId);
  if (!def) return 0;
  const n = getStaffLevel(loc, roleId);
  return def.headcount ? Math.max(0, n - def.owner) : n > 0 ? 1 : 0;
}

/** Stundenlohn einer Rolle beim aktuellen Stand (alle Köpfe bzw. die Stufe), × Preisniveau. */
export function roleWagePerHour(loc: LocationState, roleId: string, locationId: string): number {
  const def = STAFF_ROLES.find((r) => r.id === roleId);
  if (!def) return 0;
  const n = getStaffLevel(loc, roleId);
  const scale = getLocationDef(locationId).scale;
  if (def.headcount) return paidHeads(loc, roleId) * def.wage * scale;
  return n > 0 ? (def.wage + def.wagePerLevel * (n - 1)) * scale : 0;
}

/** Lohn je geöffneter Stunde für das ganze Team. */
export function wagesPerOpenHour(loc: LocationState, locationId: string): number {
  return STAFF_ROLES.reduce((a, r) => a + roleWagePerHour(loc, r.id, locationId), 0);
}

/** Gekaufte Geräte (für den Strom). */
function deviceCount(loc: LocationState): number {
  return Object.values(loc.stations).filter((s) => s.level > 0).length;
}

/** Miete je Tag (rund um die Uhr), × Preisniveau. */
export function rentPerDay(loc: LocationState, locationId: string): number {
  const r = BALANCE.rent;
  const a = loc.ambience;
  return (
    (r.basePerDay +
      (a['terrace'] ?? 0) * r.perTerracePerDay +
      (a['parking'] ?? 0) * r.perParkingPerDay) *
    getLocationDef(locationId).scale
  );
}

/** Strom und Nebenkosten je geöffneter Stunde, × Preisniveau. */
export function utilitiesPerOpenHour(loc: LocationState, locationId: string): number {
  const r = BALANCE.rent;
  return (
    (r.utilitiesPerOpenHour + deviceCount(loc) * r.perDevicePerOpenHour) *
    getLocationDef(locationId).scale
  );
}

export function computeSatisfactionTarget(
  loc: LocationState,
  parts: {
    waitPressure: number;
    gradeSatisfaction: number;
    tableService: number;
    noMatcha: boolean;
    zenBonus?: number;
    eventBonus?: number;
  },
): SatisfactionBreakdown {
  const s = BALANCE.satisfaction;
  const decor = (loc.ambience['decor'] ?? 0) * s.perDecor;
  const wait = -parts.waitPressure * s.waitPressureWeight;
  const cleanliness = (loc.cleanliness - s.cleanlinessNeutral) * s.cleanlinessWeight;
  const tableService = parts.tableService * BALANCE.service.tableServiceSatisfaction;
  const matcha = parts.noMatcha ? s.noMatcha : 0;
  const zen = parts.zenBonus ?? 0;
  const event = parts.eventBonus ?? 0;
  const target = clamp(
    s.base +
      decor +
      parts.gradeSatisfaction +
      zen +
      event +
      wait +
      cleanliness +
      tableService +
      matcha,
    0,
    100,
  );
  return {
    base: s.base,
    decor,
    quality: parts.gradeSatisfaction,
    zen,
    event,
    waitPressure: wait,
    cleanliness,
    tableService,
    matcha,
    target,
  };
}

export interface RateOptions {
  /** Für diese Tagesstunde rechnen (Planung, Tageskurve); sonst die aktuelle Stunde der Spieluhr. */
  hour?: number;
  /** So rechnen, als hätte das Café in dieser Stunde geöffnet (Planung der Öffnungszeiten). */
  forceOpen?: boolean;
  /**
   * Influencer-Hype mitrechnen. Er ist ein 5-s-Boost aus aktiver Spielzeit; Offline-Einnahmen und Zeitsprung
   * rechnen wie bei Boosts, Events und Kampagne ohne ihn.
   */
  influencerHype?: boolean;
}

interface Line {
  id: string;
  attach: number;
  price: Decimal;
  goods: number;
  grams: number;
}

export function computeLocationRates(
  state: GameState,
  locationId: string,
  opts: RateOptions = {},
): LocationRates {
  const loc = getLocation(state, locationId);
  const place = getLocationDef(locationId);
  const mods = collectModifiers(state, locationId);
  const shares = customerTypeShares(locationId);
  const hour = opts.hour ?? hourOf(state.clock);
  const open = opts.forceOpen === true || isOpenHour(loc.hours, hour);

  // Matcha im Ausschank; ein Lieferengpass macht ihn um Stufen schlechter.
  const grade = gradeInUse(loc.supply);
  const effectiveGrade = grade < 0 ? -1 : Math.max(0, grade - mods.qualityPenalty);
  const gradeDef = effectiveGrade >= 0 ? getGradeDef(effectiveGrade) : null;

  // Speisekarte (Warenkorb, § 4): jede Linie mit Level ≥ 1, Matcha-Produkte nur mit Vorrat.
  const lines: Line[] = [];
  let menuDemand = 0;
  let load = 0;
  for (const def of PRODUCT_LINES) {
    const lvl = loc.stations[def.id]?.level ?? 0;
    const tier = lvl > 0 ? menuTier(def, lvl) : null;
    if (!tier || (def.matchaGrams > 0 && !gradeDef)) continue;
    const attach =
      tier.attach * attachMult(def, shares.tourist) * (mods.stationAttachMult[def.id] ?? 1);
    lines.push({
      id: def.id,
      attach,
      price: getItemPrice(def, lvl, locationId, effectiveGrade),
      goods: def.goodsCost * place.scale,
      grams: def.matchaGrams,
    });
    menuDemand += tier.demand;
    load += (attach * def.workMin) / getStationSpeed(def, lvl);
  }

  // Nachfrage (§ 7.1): Tageskurve × Anziehung des Cafés.
  const d = BALANCE.demand;
  const a = loc.ambience;
  const attraction =
    (1 + menuDemand) *
    (gradeDef ? gradeDef.demandMult : d.noMatchaMult) *
    (1 + (a['decor'] ?? 0) * d.perDecor) *
    (1 + (a['wifi'] ?? 0) * d.perWifi) *
    (1 + (a['parking'] ?? 0) * d.perParking) *
    followerDemandMult(loc.social.followers) *
    (1 + Math.min(d.buzzMax, Math.max(0, loc.social.buzz))) *
    satisfactionFactor(loc.satisfaction);
  const curve = DEMAND_CURVE[hour] ?? 0;
  const base = open ? d.basePerHour * place.demand * curve * attraction * mods.spawnMult : 0;
  const capacity = capacityPerHour(loc) * mods.spawnMult;
  // Influencer-Hype aus dem Spawn ohne Hype (sonst Rückkopplung). Er hebt nur die Nachfrage, nicht die Plätze.
  const perRealSec = (perHour: number): number => (perHour * TIME.openMinutesPerSec) / 60;
  const hype =
    opts.influencerHype === false || !open
      ? 1
      : Math.min(
          influencerHypeMult(perRealSec(Math.min(base, capacity) * shares.influencer)),
          BOOST_RULES.maxMult / mods.spawnMult,
        );
  const demand = base * hype;
  const spawnRate = Math.min(demand, capacity);

  // Pipeline (§ 7.2): Bestellung, Zubereitung (mit Abholung an der Theke), Tischservice.
  const order = orderCapacity(loc, mods.speedMult);
  const waiterCap = serviceCapacity(loc, mods.speedMult);
  const baristaMin = getStaffLevel(loc, 'barista') * mods.speedMult * 60;
  const production = productionCapacity(baristaMin, load, waiterCap);
  const totalThroughput = Math.min(order, production);
  const served = Math.min(spawnRate, totalThroughput);
  const tableServiceShare =
    served > 0 ? Math.min(1, waiterCap / served) : getStaffLevel(loc, 'waiter') > 0 ? 1 : 0;
  // Ohne Karte (kein Matcha und nichts anderes) wartet niemand – die Gäste gehen gleich wieder; das drückt die
  // Zufriedenheit über „Matcha ausverkauft“, nicht über die Wartezeit.
  const waitPressure =
    open && lines.length > 0
      ? clamp(
          spawnRate / Math.max(totalThroughput, 1e-9) - 1,
          0,
          BALANCE.satisfaction.waitPressureMax,
        )
      : 0;
  const stages: Record<StageId, number> = {
    demand: spawnRate,
    order,
    production,
    service: waiterCap,
  };
  let bottleneck: StageId = 'demand';
  if (spawnRate > totalThroughput && lines.length > 0)
    bottleneck = production < order ? 'production' : 'order';

  // Bon und Geld (§ 7.2): Trinkgeld obendrauf, Boosts und Zen auf alles.
  const tips =
    tipRate(loc, locationId) * mods.tipMult + tableServiceShare * BALANCE.service.tableServiceTips;
  const priceMult = mods.incomeMult * mods.prestigeMult;
  const perStation: Record<string, number> = {};
  const perStationIncome: Record<string, Decimal> = {};
  let ticket = ZERO;
  let goodsPerGuest = 0;
  let gramsPerGuest = 0;
  for (const l of lines) {
    ticket = ticket.add(l.price.mul(l.attach));
    goodsPerGuest += l.attach * l.goods;
    gramsPerGuest += l.attach * l.grams;
    perStation[l.id] = served * l.attach;
    perStationIncome[l.id] = l.price.mul(served * l.attach * (1 + tips) * priceMult);
  }
  const sales = ticket.mul(served * priceMult);
  const rentPerHour =
    rentPerDay(loc, locationId) / 24 + (open ? utilitiesPerOpenHour(loc, locationId) : 0);

  return {
    hour,
    open,
    demand,
    capacity,
    spawnRate,
    totalThroughput,
    served,
    incomePerHour: sales.mul(1 + tips),
    tipsPerHour: sales.mul(tips),
    goodsPerHour: D(goodsPerGuest * served),
    wagesPerHour: D(open ? wagesPerOpenHour(loc, locationId) : 0),
    rentPerHour: D(rentPerHour),
    matchaGramsPerHour: gramsPerGuest * served,
    waitPressure,
    satisfactionFactor: satisfactionFactor(loc.satisfaction),
    tipRate: tips,
    influencerHypeMult: hype,
    satisfaction: computeSatisfactionTarget(loc, {
      waitPressure,
      gradeSatisfaction: gradeDef ? gradeDef.satisfaction : 0,
      tableService: tableServiceShare,
      noMatcha: !gradeDef,
      zenBonus: mods.satisfactionBonus,
      eventBonus: mods.eventSatisfaction,
    }),
    stages,
    bottleneck,
    loadPerCustomer: load,
    avgServeTime: averageServeTime(),
    tableServiceShare,
    avgTicket: ticket,
    grade,
    effectiveGrade,
    perStation,
    perStationIncome,
  };
}

/** Umsatz/h (inkl. Trinkgeld) zur aktuellen Stunde. */
export function getIncomePerHour(state: GameState, locationId: string): Decimal {
  return computeLocationRates(state, locationId).incomePerHour;
}

/**
 * Umsatz/h zur Hauptzeit (beste geöffnete Stunde): Maß für Belohnungen und Kosten, die sich am „normalen“
 * Geschäft orientieren (Café-Level-Belohnung, Startkapital, Lieferengpass) – unabhängig davon, ob gerade Nacht ist.
 */
export function peakIncomePerHour(state: GameState, locationId: string): Decimal {
  const loc = getLocation(state, locationId);
  let best = D(0);
  for (let h = loc.hours.open; h < loc.hours.close; h++) {
    const v = computeLocationRates(state, locationId, {
      hour: h,
      influencerHype: false,
    }).incomePerHour;
    if (v.gt(best)) best = v;
  }
  return best;
}
