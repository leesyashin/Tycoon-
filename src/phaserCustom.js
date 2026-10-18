/*
 * Schlanker Phaser-Build (PLAN S9 „Performance“): nur die Module, die BootScene/CafeScene nutzen –
 * ohne Physik (Arcade/Matter), Sound, Tastatur/Gamepad, Tilemaps, BitmapText, Video, Spine, Mesh usw. Das halbiert die
 * Parse-/Auswertezeit des Phaser-Chunks. Vite leitet `import Phaser from 'phaser'` hierher um
 * (vite.config.ts); die Typen kommen weiter aus dem `phaser`-Paket.
 * Wer in der Szene ein neues Phaser-Feature nutzt, muss es hier ergänzen (sonst `undefined` zur Laufzeit).
 */
import CONST from 'phaser/src/const.js';
import Extend from 'phaser/src/utils/object/Extend.js';
import Animations from 'phaser/src/animations/index.js';
import BlendModes from 'phaser/src/renderer/BlendModes.js';
import Cache from 'phaser/src/cache/index.js';
import Scene2D from 'phaser/src/cameras/2d/index.js';
import Core from 'phaser/src/core/index.js';
import Class from 'phaser/src/utils/Class.js';
import Data from 'phaser/src/data/index.js';
import Masks from 'phaser/src/display/mask/index.js';
import Events from 'phaser/src/events/index.js';
import FX from 'phaser/src/fx/index.js';
import Game from 'phaser/src/core/Game.js';
import GeomRectangle from 'phaser/src/geom/rectangle/Rectangle.js';
import DisplayList from 'phaser/src/gameobjects/DisplayList.js';
import GameObjectCreator from 'phaser/src/gameobjects/GameObjectCreator.js';
import GameObjectFactory from 'phaser/src/gameobjects/GameObjectFactory.js';
import UpdateList from 'phaser/src/gameobjects/UpdateList.js';
import Components from 'phaser/src/gameobjects/components/index.js';
import GameObject from 'phaser/src/gameobjects/GameObject.js';
import Graphics from 'phaser/src/gameobjects/graphics/Graphics.js';
import Image from 'phaser/src/gameobjects/image/Image.js';
import Layer from 'phaser/src/gameobjects/layer/Layer.js';
import Text from 'phaser/src/gameobjects/text/Text.js';
import Particles from 'phaser/src/gameobjects/particles/index.js';
import Rectangle from 'phaser/src/gameobjects/shape/rectangle/Rectangle.js';
import InputPlugin from 'phaser/src/input/InputPlugin.js';
import InputEvents from 'phaser/src/input/events/index.js';
import Pointer from 'phaser/src/input/Pointer.js';
import LoaderPlugin from 'phaser/src/loader/LoaderPlugin.js';
import PhaserMath from 'phaser/src/math/index.js';
import Plugins from 'phaser/src/plugins/index.js';
import Renderer from 'phaser/src/renderer/index.js';
import Scale from 'phaser/src/scale/index.js';
import ScaleModes from 'phaser/src/renderer/ScaleModes.js';
import Scene from 'phaser/src/scene/Scene.js';
import Scenes from 'phaser/src/scene/index.js';
import Structs from 'phaser/src/structs/index.js';
import Textures from 'phaser/src/textures/index.js';
import Time from 'phaser/src/time/index.js';
import Tweens from 'phaser/src/tweens/index.js';
import PipelineManager from 'phaser/src/renderer/webgl/PipelineManager.js';
import PIPELINES from 'phaser/src/renderer/webgl/pipelines/const.js';
// Factories registrieren sich beim Import an `this.add`; Loader-Dateitypen an `this.load`.
import 'phaser/src/gameobjects/graphics/GraphicsFactory.js';
import 'phaser/src/gameobjects/image/ImageFactory.js';
import 'phaser/src/gameobjects/layer/LayerFactory.js';
import 'phaser/src/gameobjects/text/TextFactory.js';
import 'phaser/src/gameobjects/particles/ParticleEmitterFactory.js';
import 'phaser/src/gameobjects/shape/rectangle/RectangleFactory.js';
import 'phaser/src/loader/filetypes/AtlasJSONFile.js';
import 'phaser/src/loader/filetypes/ImageFile.js';
import 'phaser/src/loader/filetypes/JSONFile.js';

// Phaser kompiliert beim Start die Shader aller Standard-Pipelines. Licht, Punktlicht, Rope, Bitmap-Masken
// und Single (nur für DynamicTexture/RenderTexture) nutzt die Szene nicht – raus, das spart Boot-Zeit.
const UNUSED_PIPELINES = [
  PIPELINES.LIGHT_PIPELINE,
  PIPELINES.POINTLIGHT_PIPELINE,
  PIPELINES.ROPE_PIPELINE,
  PIPELINES.BITMAPMASK_PIPELINE,
  PIPELINES.SINGLE_PIPELINE,
];
const bootPipelines = PipelineManager.prototype.boot;
PipelineManager.prototype.boot = function (...args) {
  for (const name of UNUSED_PIPELINES) this.classes.delete(name);
  return bootPipelines.apply(this, args);
};

const Phaser = Extend(
  false,
  {
    Animations,
    BlendModes,
    Cache,
    Cameras: { Scene2D },
    Core,
    Class,
    Data,
    Display: { Masks },
    Events,
    FX,
    Game,
    Geom: { Rectangle: GeomRectangle },
    GameObjects: {
      DisplayList,
      GameObjectCreator,
      GameObjectFactory,
      UpdateList,
      Components,
      GameObject,
      Graphics,
      Image,
      Layer,
      Text,
      Particles,
      Rectangle,
    },
    // Ohne Keyboard/Gamepad-Plugins: die Szene braucht nur Zeiger (Maus/Touch).
    Input: { InputPlugin, Events: InputEvents, Pointer },
    Loader: { LoaderPlugin },
    Math: PhaserMath,
    Plugins,
    Renderer,
    Scale,
    ScaleModes,
    Scene,
    Scenes,
    Structs,
    Textures,
    Time,
    Tweens,
  },
  CONST,
);

export default Phaser;
