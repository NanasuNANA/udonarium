import { SyncObject, SyncVar } from './core/synchronize-object/anotation';
import { GameObject } from './core/synchronize-object/game-object';
import { DataElement } from './data-element';
import { TabletopObject } from './tabletop-object';
import { ChatPalette } from './chat-palette';

@SyncObject('character')
export class GameCharacter extends TabletopObject {
  @SyncVar() rotate: number = 0;

  get altitude(): number {
    let element = this.getElement('altitude', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('altitude', 0, {}, 'altitude_' + this.identifier));
    }
    let num = element ? +element.value : 0;
    return Number.isNaN(num) ? 0 : num;
  }
  
  get name(): string { return this.getCommonValue('name', ''); }
  get size(): number { return this.getCommonValue('size', 1); }
  
  get isInvert(): boolean {
    let element = this.getElement('invert', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('invert', '', { type: 'check' }, 'invert_' + this.identifier));
    }
    return element ? (+element.value !== 0) : false;
  }

  set invert(isInvert: boolean) {
    let element = this.getElement('invert', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('invert', isInvert ? 'invert' : '', { type: 'check' }, 'invert_' + this.identifier));
    } else {
      element.value = isInvert ? 'invert' : '';
    }
  }

  get isProne(): boolean {
    let element = this.getElement('prone', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('prone', '', { type: 'check' }, 'prone_' + this.identifier));
    }
    return element ? (+element.value !== 0) : false;
  }

  set prone(isProne: boolean) {
    let element = this.getElement('prone', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('prone', isProne ? 'prone' : '', { type: 'check' }, 'prone_' + this.identifier));
    } else {
      element.value = isProne ? 'prone' : '';
    }
  }

  get directions(): number {
    let element = this.getElement('directions', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('directions', 0, { type: 'polygonal' }, 'directions_' + this.identifier));
    }
    let num = element ? +element.value : 0;
    return Number.isNaN(num) ? 0 : num;
  }

  set directions(directions: number) {
    let element = this.getElement('directions', this.commonDataElement);
    if (!element) {
      this.commonDataElement.appendChild(DataElement.create('directions', directions, { type: 'polygonal' }, 'directions_' + this.identifier));
    } else {
      element.value = directions;
    }
  }

  get chatPalette(): ChatPalette {
    for (let child of this.children) {
      if (child instanceof ChatPalette) return child;
    }
    return null;
  }

  setLocation(location: string) {
    //this.syncData.location.locationName = location;
    this.location.name = location;
    this.update();
  }

  static createGameCharacter(name: string, size: number, imageIdentifier: string): GameCharacter {
    let gameCharacter: GameCharacter = new GameCharacter();
    gameCharacter.createDataElements();
    //gameCharacter.syncData.imageIdentifier = imageIdentifier;
    //gameCharacter.syncData.name = name;
    //gameCharacter.syncData.size = size;
    gameCharacter.initialize();
    gameCharacter.createTestGameDataElement(name, size, imageIdentifier);

    return gameCharacter;
  }

  createTestGameDataElement(name: string, size: number, imageIdentifier: string) {
    this.createDataElements();

    let nameElement: DataElement = DataElement.create('name', name, {}, 'name_' + this.identifier);
    let sizeElement: DataElement = DataElement.create('size', size, {}, 'size_' + this.identifier);
    let altitudeElement: DataElement = DataElement.create('altitude', 0, {}, 'altitude_' + this.identifier);
    let invertElement: DataElement = DataElement.create('invert', '', { type: 'check' }, 'invert_' + this.identifier);
    let proneElement: DataElement = DataElement.create('prone', '', { type: 'check' }, 'prone_' + this.identifier);
    let directionsElement: DataElement = DataElement.create('directions', 0, { type: 'polygonal' }, 'directions_' + this.identifier);

    if (this.imageDataElement.getFirstElementByName('imageIdentifier')) {
      this.imageDataElement.getFirstElementByName('imageIdentifier').value = imageIdentifier;
      this.imageDataElement.getFirstElementByName('imageIdentifier').update();
    }

    let resourceElement: DataElement = DataElement.create('リソース', '', {}, 'リソース' + this.identifier);
    let hpElement: DataElement = DataElement.create('HP', 200, { 'type': 'numberResource', 'currentValue': '200' }, 'HP_' + this.identifier);
    let mpElement: DataElement = DataElement.create('MP', 100, { 'type': 'numberResource', 'currentValue': '100' }, 'MP_' + this.identifier);

    this.commonDataElement.appendChild(nameElement);
    this.commonDataElement.appendChild(sizeElement);
    this.commonDataElement.appendChild(altitudeElement);
    this.commonDataElement.appendChild(invertElement);
    this.commonDataElement.appendChild(proneElement);
    this.commonDataElement.appendChild(directionsElement);

    this.detailDataElement.appendChild(resourceElement);
    resourceElement.appendChild(hpElement);
    resourceElement.appendChild(mpElement);

    //TEST
    let testElement: DataElement = DataElement.create('情報', '', {}, '情報' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('説明', 'タグのある最初のノートはツールチップとして表示される\nあいうえお', { 'type': 'note' }, '説明' + this.identifier));
    testElement.appendChild(DataElement.create('メモ', '任意の文字列\n１\n２\n３\n４\n５', { 'type': 'note' }, 'メモ' + this.identifier));

    //TEST
    testElement = DataElement.create('能力', '', {}, '能力' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('器用度', 24, { type: 'simpleNumber' }, '器用度' + this.identifier));
    testElement.appendChild(DataElement.create('敏捷度', 24, { type: 'simpleNumber' }, '敏捷度' + this.identifier));
    testElement.appendChild(DataElement.create('筋力', 24, { type: 'simpleNumber' }, '筋力' + this.identifier));
    testElement.appendChild(DataElement.create('生命力', 24, { type: 'simpleNumber' }, '生命力' + this.identifier));
    testElement.appendChild(DataElement.create('知力', 24, { type: 'simpleNumber' }, '知力' + this.identifier));
    testElement.appendChild(DataElement.create('精神力', 24, { type: 'simpleNumber' }, '精神力' + this.identifier));

    //TEST
    testElement = DataElement.create('戦闘特技', '', {}, '戦闘特技' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('Lv1', '全力攻撃', {}, 'Lv1' + this.identifier));
    testElement.appendChild(DataElement.create('Lv3', '武器習熟/ソード', {}, 'Lv3' + this.identifier));
    testElement.appendChild(DataElement.create('Lv5', '武器習熟/ソードⅡ', {}, 'Lv5' + this.identifier));
    testElement.appendChild(DataElement.create('Lv7', '頑強', {}, 'Lv7' + this.identifier));
    testElement.appendChild(DataElement.create('Lv9', '薙ぎ払い', {}, 'Lv9' + this.identifier));
    testElement.appendChild(DataElement.create('自動', '治癒適正', {}, '自動' + this.identifier));

    //console.log('serializeToXmlString\n' + this.rootDataElement.toXml());

    let domParser: DOMParser = new DOMParser();
    let gameCharacterXMLDocument: Document = domParser.parseFromString(this.rootDataElement.toXml(), 'application/xml');
    //console.log(gameCharacterXMLDocument);

    //console.log('serializeToJson\n' + GameDataElement.serializeToJson(this.rootDataElement));

    let palette: ChatPalette = new ChatPalette('ChatPalette_' + this.identifier);
    palette.setPalette(`チャットパレット入力例：
2d6+1 ダイスロール
１ｄ２０＋{敏捷}＋｛格闘｝　{name}の格闘！
//敏捷=10+{敏捷A}
//敏捷A=10
//格闘＝１`);
    palette.initialize();
    this.appendChild(palette);

    this.update();
  }
}

export interface GameCharacterContainer {
  name: string;
  size: number;
  imageIdentifier: string;
  dataElementIdentifier: string;
  location: GameObjectLocationContainer;
}

export interface GameObjectLocationContainer {
  locationName: string;
  x: number;
  y: number;
}