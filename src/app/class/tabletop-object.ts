import { DataElement } from './data-element';
import { ObjectStore } from './core/synchronize-object/object-store';
import { SyncObject, SyncVar } from './core/synchronize-object/anotation';
import { GameObject } from './core/synchronize-object/game-object';
import { ObjectNode } from './core/synchronize-object/object-node';
import { ObjectSerializer, InnerXml } from './core/synchronize-object/object-serializer';
import { FileStorage } from './core/file-storage/file-storage';
import { ImageFile } from './core/file-storage/image-file';

export interface TabletopLocation {
  name: string;
  x: number;
  y: number;
}

@SyncObject('TabletopObject')
export class TabletopObject extends ObjectNode {
  @SyncVar() location: TabletopLocation = {
    name: 'table',
    x: 0,
    y: 0
  };

  @SyncVar() posZ: number = 0;

  private _imageFile: ImageFile = ImageFile.createEmpty('null');
  private _dataElements: { [name: string]: string } = {};

  // GameDataElement getter/setter
  get rootDataElement(): DataElement {
    for (let node of this.children) {
      if (node.getAttribute('name') === this.aliasName) return <DataElement>node;
    }
    return null;
  }

  get imageDataElement(): DataElement { return this.getElement('image'); }
  get commonDataElement(): DataElement { return this.getElement('common'); }
  get detailDataElement(): DataElement { return this.getElement('detail'); }

  get imageFile(): ImageFile {
    if (!this.imageDataElement) return this._imageFile;
    let imageIdElement: DataElement = this.imageDataElement.getFirstElementByName('imageIdentifier');
    if (imageIdElement && this._imageFile.identifier !== imageIdElement.value) {
      let file: ImageFile = FileStorage.instance.get(<string>imageIdElement.value);
      if (file) this._imageFile = file;
    }
    return this._imageFile;
  }

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
  
  get resources(): {name: string; value: number; max: number}[] {
    let elements = this.detailDataElement.getElementsByType('numberResource');
    let result: {name: string; value: number; max: number}[] = [];
    for (let element of elements) {
      if (element.name && element.name.trim() && element.name.trim().indexOf('#') != 0) {
        let obj = {name: element.name.trim(), value: 0, max: 0};
        if (element.currentValue) obj.value = <number>+element.currentValue;
        if (element.value) obj.max = <number>+element.value;
        result.push(obj);
      }
    }
    return result;
  }

  get statuses(): {name: string; repletion?: string;}[] {
    let elements = this.detailDataElement.getElementsByType('status');
    let result: {name: string; repletion: string;}[] = [];
    for (let element of elements) {
      if (element.value && element.value.toString().trim() && element.value.toString().trim().indexOf('#') != 0) {
        result.push({name: element.value.toString().trim(), repletion: element.currentValue ? element.currentValue.toString().trim() : null});
      }
    }
    return result;
  }

  get expendables(): {name: string; expended: boolean}[] {
    let elements = this.detailDataElement.getElementsByType('expendable');
    let result: {name: string; expended: boolean}[] = [];
    for (let element of elements) {
      if (element.name && element.name.trim() && element.name.trim().indexOf('#') != 0) {
        result.push({name: element.name.trim(), expended: !element.value});
      }
    }
    return result;
  }

  get firstNote(): {name?: string; text?: string} {
    let elements = this.detailDataElement.getElementsByType('note');
    for (let element of elements) {
      if (element.name && element.name.trim() && element.name.trim().indexOf('#') != 0) {
        return {name: element.name.trim(), text: (element.value && element.value.toString()) ? element.value.toString() : null};
      }
    }
    return {};
  }

  //TODO 内容をもう少しリッチに
  get infomationText(): string { return this.firstNote.text }

  static createTabletopObject(name: string, identifier?: string): TabletopObject {

    let gameObject: TabletopObject = new TabletopObject(identifier);
    gameObject.createDataElements();

    /* debug */
    console.log('serializeToXmlString\n' + gameObject.rootDataElement.toXml());
    let domParser: DOMParser = new DOMParser();
    let xmlDocument: Document = domParser.parseFromString(gameObject.rootDataElement.toXml(), 'application/xml');
    console.log(xmlDocument);
    /* debug */

    return gameObject;
  }

  protected createDataElements() {
    this.initialize();
    let aliasName: string = this.aliasName;
    //console.log('rootDataElement??1', this, this.rootDataElement);
    if (!this.rootDataElement) {
      let rootElement = DataElement.create(aliasName, '', {}, aliasName + '_' + this.identifier);
      this.appendChild(rootElement);
    }

    if (!this.imageDataElement) {
      this.rootDataElement.appendChild(DataElement.create('image', '', {}, 'image_' + this.identifier));
      this.imageDataElement.appendChild(DataElement.create('imageIdentifier', '', { type: 'image' }, 'imageIdentifier_' + this.identifier));
    }
    if (!this.commonDataElement) this.rootDataElement.appendChild(DataElement.create('common', '', {}, 'common_' + this.identifier));
    if (!this.detailDataElement) this.rootDataElement.appendChild(DataElement.create('detail', '', {}, 'detail_' + this.identifier));
  }

  getElement(name: string, from: DataElement = this.rootDataElement): DataElement {
    if (!from) return null;
    let element: DataElement = this._dataElements[name] ? ObjectStore.instance.get(this._dataElements[name]) : null;
    if (!element || !from.contains(element)) {
      element = from.getFirstElementByName(name);
      this._dataElements[name] = element ? element.identifier : null;
    }
    return element;
  }

  protected getCommonValue<T extends string | number>(elementName: string, defaultValue: T): T {
    let element = this.getElement(elementName, this.commonDataElement);
    if (!element) return defaultValue;

    if (typeof defaultValue === 'number') {
      let number: number = +element.value;
      return <T>(Number.isNaN(number) ? defaultValue : number);
    } else {
      return <T>(element.value + '');
    }
  }

  protected setCommonValue(elementName: string, value: any) {
    let element = this.getElement(elementName, this.commonDataElement);
    if (!element) { return; }
    element.value = value;
  }

  protected getImageFile(elementName: string) {
    if (!this.imageDataElement) return null;
    let image = this.getElement(elementName, this.imageDataElement);
    return image ? FileStorage.instance.get(<string>image.value) : null;
  }

  protected setImageFile(elementName: string, imageFile: ImageFile) {
    let image = imageFile ? this.getElement(elementName, this.imageDataElement) : null;
    if (!image) return;
    image.value = imageFile.identifier;
  }

  setLocation(location: string) {
    this.location.name = location;
    this.update();
  }
}
