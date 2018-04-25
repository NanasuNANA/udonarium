import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';

import { ImageFile } from '../../class/core/file-storage/image-file';
import { EventSystem } from '../../class/core/system/system';
import { Terrain, TerrainViewState } from '../../class/terrain';
import { ContextMenuService } from '../../service/context-menu.service';
import { PanelOption, PanelService } from '../../service/panel.service';
import { PointerCoordinate, PointerDeviceService } from '../../service/pointer-device.service';
import { GameCharacterSheetComponent } from '../game-character-sheet/game-character-sheet.component';
import { MovableOption } from '../../directive/movable.directive';
import { RotableOption } from '../../directive/rotable.directive';

@Component({
  selector: 'terrain',
  templateUrl: './terrain.component.html',
  styleUrls: ['./terrain.component.css']
})
export class TerrainComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() terrain: Terrain = null;
  @Input() is3D: boolean = false;

  get name(): string { return this.terrain.name; }
  get mode(): TerrainViewState { return this.terrain.mode; }
  set mode(mode: TerrainViewState) { this.terrain.mode = mode; }

  get isLocked(): boolean { return this.terrain.isLocked; }
  set isLocked(isLocked: boolean) { this.terrain.isLocked = isLocked; }
  get hasWall(): boolean { return this.terrain.hasWall; }
  get hasFloor(): boolean { return this.terrain.hasFloor; }

  get wallImage(): ImageFile { return this.terrain.wallImage; }
  get floorImage(): ImageFile { return this.terrain.floorImage; }

  get height(): number { return this.adjustMinBounds(this.terrain.height); }
  get width(): number { return this.adjustMinBounds(this.terrain.width); }
  get depth(): number { return this.adjustMinBounds(this.terrain.depth); }

  get tooltipInfo(): string { return this.terrain.firstNote.text }

  gridSize: number = 50;

  movableOption: MovableOption = {};
  rotableOption: RotableOption = {};

  constructor(
    private contextMenuService: ContextMenuService,
    private panelService: PanelService,
    private elementRef: ElementRef,
    private pointerDeviceService: PointerDeviceService
  ) { }

  ngOnInit() {
    this.movableOption = {
      tabletopObject: this.terrain,
      transformCssOffset: 'translateZ(-0.15px)'
    };
    this.rotableOption = {
      tabletopObject: this.terrain
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
  onDragMouseDown(e: any) {
    console.log('TerrainComponent mousedown !!!');
    e.preventDefault();

    // TODO:もっと良い方法考える
    if (this.isLocked) {
      EventSystem.trigger('DRAG_LOCKED_OBJECT', {});
    }
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    console.log('Terrein onContextMenu', this.pointerDeviceService.isAllowedToOpenContextMenu);
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    let potison = this.pointerDeviceService.pointers[0];
    console.log('mouseCursor', potison);
    this.contextMenuService.open(potison, [
      (this.isLocked
        ? {
          name: '固定解除', action: () => {
            this.isLocked = false;
            this.terrain.update();
          }
        } : {
          name: '固定する', action: () => {
            this.isLocked = true;
            this.terrain.update();
          }
        }),
      (this.hasWall
        ? {
          name: '壁を非表示', action: () => {
            this.mode = TerrainViewState.FLOOR;
            if (this.depth * this.width === 0) {
              this.terrain.width = this.width <= 0 ? 1 : this.width;
              this.terrain.depth = this.depth <= 0 ? 1 : this.depth;
            }
          }
        } : {
          name: '壁を表示', action: () => {
            this.mode = TerrainViewState.ALL;
          }
        }),
      { name: '地形設定を編集', action: () => { this.showDetail(this.terrain); } },
      {
        name: 'コピーを作る', action: () => {
          let cloneObject = this.terrain.clone();
          console.log('コピー', cloneObject);
          cloneObject.location.x += this.gridSize;
          cloneObject.location.y += this.gridSize;
          cloneObject.isLocked = false;
          cloneObject.update();
          if (this.terrain.parent) this.terrain.parent.appendChild(cloneObject);
        }
      },
      { name: '削除する', action: () => { this.terrain.destroy(); } },
    ], this.name);
  }

  private adjustMinBounds(value: number, min: number = 0): number {
    return value < min ? min : value;
  }

  private showDetail(gameObject: Terrain) {
    console.log('onSelectedGameObject <' + gameObject.aliasName + '>', gameObject.identifier);
    EventSystem.trigger('SELECT_TABLETOP_OBJECT', { identifier: gameObject.identifier, className: gameObject.aliasName });
    let coordinate = this.pointerDeviceService.pointers[0];
    let option: PanelOption = { left: coordinate.x - 250, top: coordinate.y - 150, width: 500, height: 340 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }
}