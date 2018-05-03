import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild, NgZone } from '@angular/core';
import { MarkdownService } from 'ngx-markdown';

import { ImageFile } from '../../class/core/file-storage/image-file';
import { EventSystem } from '../../class/core/system/system';
import { Terrain, TerrainViewState } from '../../class/terrain';
import { ContextMenuService } from '../../service/context-menu.service';
import { PanelOption, PanelService } from '../../service/panel.service';
import { PointerCoordinate, PointerDeviceService } from '../../service/pointer-device.service';
import { GameCharacterSheetComponent } from '../game-character-sheet/game-character-sheet.component';
import { TextNote } from '../../class/text-note';
import { TabletopObject } from '../../class/tabletop-object';
import { MovableOption } from '../../directive/movable.directive';
import { RotableOption } from '../../directive/rotable.directive';

@Component({
  selector: 'text-note',
  templateUrl: './text-note.component.html',
  styleUrls: ['./text-note.component.css']
})
export class TextNoteComponent implements OnInit {
  @ViewChild('textArea') textAreaElementRef: ElementRef;
  @ViewChild('markdownArea') markdownAreaElementRef: ElementRef;

  @Input() textNote: TextNote = null;
  @Input() is3D: boolean = false;

  get title(): string { return this.textNote.title; }
  get text(): string { this.calcFitHeightIfNeeded(); return this.textNote.text; }
  set text(text: string) { this.calcFitHeightIfNeeded(); this.textNote.text = text; }
  get fontSize(): number { this.calcFitHeightIfNeeded(); return this.textNote.fontSize; }
  get imageFile(): ImageFile { return this.textNote.imageFile; }
  get rotate(): number { return this.textNote.rotate; }
  set rotate(rotate: number) { this.textNote.rotate = rotate; }
  get height(): number { return this.adjustMinBounds(this.textNote.height); }
  get width(): number { return this.adjustMinBounds(this.textNote.width); }
  get altitude(): number { return this.textNote.altitude; }

  get isSelected(): boolean { return document.activeElement === this.textAreaElementRef.nativeElement; }

  private callbackOnMouseUp = (e) => this.onMouseUp(e);

  gridSize: number = 50;

  private doubleClickTimer: NodeJS.Timer = null;
  private doubleClickPoint = { x: 0, y: 0 };

  private calcFitHeightTimer: NodeJS.Timer = null;

  movableOption: MovableOption = {};
  rotableOption: RotableOption = {};

  constructor(
    private ngZone: NgZone,
    private contextMenuService: ContextMenuService,
    private panelService: PanelService,
    private elementRef: ElementRef,
    private pointerDeviceService: PointerDeviceService,
    private markdownService: MarkdownService
  ) { }

  ngOnInit() {
    this.movableOption = {
      tabletopObject: this.textNote,
      colideLayers: ['terrain'],
      updateTransformCssFunction: (posX: number, posY: number, posZ: number, others: {}) => { return 'translateX(' + posX + 'px) translateY(' + posY + 'px) translateZ(' + ((!posZ || others['altitude'] * this.gridSize > posZ) ? others['altitude'] * this.gridSize : posZ) + 'px)' }
    };
    this.rotableOption = {
      tabletopObject: this.textNote
    };
  }

  ngAfterViewInit() { }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  @HostListener('dragstart', ['$event'])
  onDragstart(e) {
    console.log('Dragstart Cancel !!!!');
    e.stopPropagation();
    e.preventDefault();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: any) {
    if (e.target.tagName === 'A' || e.target.parentNode.tagName === 'A' || e.target.tagName === 'SUP') return;
    if (this.isSelected) return;
    e.preventDefault();
    this.textNote.toTopmost();

    // TODO:もっと良い方法考える
    if (e.button === 2) {
      EventSystem.trigger('DRAG_LOCKED_OBJECT', {});
      return;
    }

    this.addMouseEventListeners();
  }

  onMouseUp(e: any) {
    //if (!this.movable.isDragging && !this.rotable.isDragging) {
    if (this.pointerDeviceService.isAllowedToOpenContextMenu) {
      console.log('this.textAreaElementRef.nativeElement.focus() !!!!');
      let selection = window.getSelection();
      if (!selection.isCollapsed) selection.removeAllRanges();
      this.textAreaElementRef.nativeElement.focus();
    }
    this.removeMouseEventListeners();
    e.preventDefault();
  }

  onRotateMouseDown(e: any) {
    e.stopPropagation();
    e.preventDefault();
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    console.log('onContextMenu');
    this.removeMouseEventListeners();
    if (this.isSelected) return;
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    let potison = this.pointerDeviceService.pointers[0];
    console.log('mouseCursor', potison);
    this.contextMenuService.open(potison, [
      { name: 'メモを編集', action: () => { this.showDetail(this.textNote); } },
      {
        name: 'コピーを作る', action: () => {
          let cloneObject = this.textNote.clone();
          console.log('コピー', cloneObject);
          cloneObject.location.x += this.gridSize;
          cloneObject.location.y += this.gridSize;
          cloneObject.update();
        }
      },
      { name: '削除する', action: () => { this.textNote.destroy(); } },
    ], this.title);
  }

  calcFitHeightIfNeeded() {
    if (this.calcFitHeightTimer) return;
    this.ngZone.runOutsideAngular(() => {
      this.calcFitHeightTimer = setTimeout(() => {
        this.calcFitHeight();
        this.calcFitHeightTimer = null;
      }, 0);
    });
  }

  calcFitHeight() {
    let textArea: HTMLTextAreaElement = this.textAreaElementRef.nativeElement;
    let markdownArea: HTMLTextAreaElement = this.markdownAreaElementRef.nativeElement;
    textArea.style.height = '0';
    markdownArea.style.height = '0';
    if (textArea.scrollHeight > textArea.offsetHeight) {
      textArea.style.height = textArea.scrollHeight + 'px';
    }
    if (markdownArea.scrollHeight > markdownArea.offsetHeight) {
      markdownArea.style.height = markdownArea.scrollHeight + 'px';
    }
  }

  markdownCompile(text: string): string {
    return this.markdownService.compile(text);
  }
  
  private adjustMinBounds(value: number, min: number = 0): number {
    return value < min ? min : value;
  }

  private addMouseEventListeners() {
    document.body.addEventListener('mouseup', this.callbackOnMouseUp, false);
    //document.body.addEventListener('mousemove', this.callbackOnMouseMove, false);
  }

  private removeMouseEventListeners() {
    document.body.removeEventListener('mouseup', this.callbackOnMouseUp, false);
    //document.body.removeEventListener('mousemove', this.callbackOnMouseMove, false);
  }

  private showDetail(gameObject: TabletopObject) {
    console.log('onSelectedGameObject <' + gameObject.aliasName + '>', gameObject.identifier);
    EventSystem.trigger('SELECT_TABLETOP_OBJECT', { identifier: gameObject.identifier, className: gameObject.aliasName });
    let coordinate = this.pointerDeviceService.pointers[0];
let option: PanelOption = { left: coordinate.x - 350, top: coordinate.y - 200, width: 500, height: 580 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }
}
