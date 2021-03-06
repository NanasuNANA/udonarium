import { SyncObject, SyncVar } from './core/synchronize-object/anotation';
import { ObjectContext } from './core/synchronize-object/game-object';
import { ObjectNode } from './core/synchronize-object/object-node';
import { ObjectStore } from './core/synchronize-object/object-store';
import { FileStorage } from './core/file-storage/file-storage';
import { ImageFile } from './core/file-storage/image-file';
import { DataElement } from './data-element';

export interface PaletteLine {
  palette: string;
}

export interface PaletteVariable {
  name: string;
  value: string;
}

@SyncObject('chat-palette')
export class ChatPalette extends ObjectNode {
  @SyncVar() dicebot: string = '';
  //TODO: キャラシ項目のコピー

  get paletteLines(): PaletteLine[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._paletteLines;
  }

  get paletteVariables(): PaletteVariable[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._paletteVariables;
  }

  private _palettes: string[] = [];
  private _paletteLines: PaletteLine[] = [];
  private _paletteVariables: PaletteVariable[] = [];
  private isAnalized: boolean = false;

  getPalette(): string[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._palettes
  }

  setPalette(paletteSource: string) {
    this.value = paletteSource;
    this.isAnalized = false;
    this.update();
    //this.parse(this.value);
  }

  evaluate(line: PaletteLine, extendVariables?: DataElement): string
  evaluate(line: string, extendVariables?: DataElement): string
  evaluate(line: any, extendVariables?: DataElement): string {
    let evaluate: string = '';
    if (typeof line === 'string') {
      evaluate = line;
    } else {
      evaluate = line.palette;
    }
    evaluate = evaluate.replace(/[Ａ-Ｚａ-ｚ０-９！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });

    console.log(evaluate);
    let limit = 128;
    let loop = 0;
    let isContinue = true;
    while (isContinue) {
      loop++;
      isContinue = false;
      evaluate = evaluate.replace(/\{\s*([^\{\}]+)\s*\}/g, (match, name) => {
        console.log(name);
        isContinue = true;
        for (let variable of this.paletteVariables) {
          if (variable.name == name) return variable.value;
        }
        if (extendVariables) {
          let element = extendVariables.getFirstElementByName(name);
          if (element) {
            if (element.isNumberResource) return element.currentValue + '';
            if (element.isAbilityScore) return (+element.calcAbilityScore() >= 0 ? '+' : '') + element.calcAbilityScore();
            if (element.isStatus) {
              if (!element.value) return '';
              if (!element.currentValue || element.currentValue === '0') return element.name;
              if (!isNaN(Number(element.currentValue)) || /^[\(\{\[\:\<]/.test(element.currentValue.toString())) return element.name + element.currentValue;
              return element.name + '(' + element.currentValue + ')';
            }
            return element.value + '';
          } else {
            if ((
              element = extendVariables.getFirstElementByName(name.replace(/^最大/, ''))
              || extendVariables.getFirstElementByName(name.replace(/^MAX[\:\_\-\s]?/i, ''))
              || extendVariables.getFirstElementByName(name.replace(/^基本/, ''))
              || extendVariables.getFirstElementByName(name.replace(/^初期/, ''))
              || extendVariables.getFirstElementByName(name.replace(/^原/, ''))
              || extendVariables.getFirstElementByName(name.replace(/基本値$/, ''))
              || extendVariables.getFirstElementByName(name.replace(/初期値$/, ''))
              || extendVariables.getFirstElementByName(name.replace(/原点$/, ''))
            ) && (element.isNumberResource || element.isAbilityScore)) {
              return element.value + '';
            }
            if ((element = extendVariables.getFirstElementByName(name.replace(/修正値?$/, ''))
              || extendVariables.getFirstElementByName(name.replace(/\s*Mod(ifier|\.)?$/i, ''))
              || extendVariables.getFirstElementByName(name.replace(/ボーナス$/i, ''))
            ) && element.isAbilityScore) {
                return (+element.calcAbilityScore() >= 0 ? '+' : '') + element.calcAbilityScore();
            }
          }
        }
        return '';
      });
      if (limit < loop) isContinue = false;
    }
    return evaluate;
  }

  private parse(paletteSource: string) {
    this._palettes = paletteSource.split('\n');

    this._paletteLines = [];
    this._paletteVariables = [];

    for (let palette of this._palettes) {
      let variable = this.parseVariable(palette);
      if (variable) {
        this._paletteVariables.push(variable);
        continue;
      }
      let line: PaletteLine = { palette: palette };
      this._paletteLines.push(line);
    }
    this.isAnalized = true;
  }

  // /^(\/\/|／／)(.+?)\s*(=|＝)\s*(.+?)\s*$/m;
  // /^\s*\/\/([^=\{\}]+)\s*=\s*(.+)/
  private parseVariable(palette: string): PaletteVariable {
    palette = palette.replace(/[Ａ-Ｚａ-ｚ０-９！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝]/g, function (s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
    let array = /^\s*\/\/([^=\{\}\s]+)\s*=\s*(.+)\s*/gi.exec(palette);
    if (!array) return null;
    let variable: PaletteVariable = {
      name: array[1],
      value: array[2]
    }
    return variable;
  }

  // override
  apply(context: ObjectContext) {
    super.apply(context);
    this.isAnalized = false;
  }
}