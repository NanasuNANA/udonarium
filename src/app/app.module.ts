import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { MarkdownModule, MarkedOptions, MarkedRenderer } from 'ngx-markdown';

import { AppComponent } from './app.component';
import { CardComponent } from './component/card/card.component';
import { CardStackComponent } from './component/card-stack/card-stack.component';
import { CardStackListComponent } from './component/card-stack-list/card-stack-list.component';
import { ChatMessageComponent } from './component/chat-message/chat-message.component';
import { ChatPaletteComponent } from './component/chat-palette/chat-palette.component';
import { ChatTabComponent } from './component/chat-tab/chat-tab.component';
import { ChatTabSettingComponent } from './component/chat-tab-setting/chat-tab-setting.component';
import { ChatWindowComponent } from './component/chat-window/chat-window.component';
import { ContextMenuComponent } from './component/context-menu/context-menu.component';
import { FileSelecterComponent } from './component/file-selecter/file-selecter.component';
import { FileStorageComponent } from './component/file-storage/file-storage.component';
import { GameCharacterGeneratorComponent } from './component/game-character-generator/game-character-generator.component';
import { GameCharacterSheetComponent } from './component/game-character-sheet/game-character-sheet.component';
import { GameCharacterComponent } from './component/game-character/game-character.component';
import { GameDataElementComponent } from './component/game-data-element/game-data-element.component';
import { GameObjectInventoryComponent } from './component/game-object-inventory/game-object-inventory.component';
import { GameTableMaskComponent } from './component/game-table-mask/game-table-mask.component';
import { GameTableSettingComponent } from './component/game-table-setting/game-table-setting.component';
import { GameTableComponent } from './component/game-table/game-table.component';
import { JukeboxComponent } from './component/jukebox/jukebox.component';
import { LobbyComponent } from './component/lobby/lobby.component';
import { ModalComponent } from './component/modal/modal.component';
import { PasswordCheckComponent } from './component/password-check/password-check.component';
import { PeerCursorComponent } from './component/peer-cursor/peer-cursor.component';
import { PeerMenuComponent } from './component/peer-menu/peer-menu.component';
import { RoomSettingComponent } from './component/room-setting/room-setting.component';
import { TextViewComponent } from './component/text-view/text-view.component';
import { UIPanelComponent } from './component/ui-panel/ui-panel.component';
import { TerrainComponent } from './component/terrain/terrain.component';
import { TextNoteComponent } from './component/text-note/text-note.component';
import { SafePipe } from './pipe/safe.pipe';

import { AppConfigService } from './service/app-config.service';
import { ChatMessageService } from './service/chat-message.service';
import { ContextMenuService } from './service/context-menu.service';
import { ModalService } from './service/modal.service';
import { PanelService } from './service/panel.service';
import { PointerDeviceService } from './service/pointer-device.service';

import { TabletopService } from './service/tabletop.service';
import { MovableDirective } from './directive/movable.directive';
import { RotableDirective } from './directive/rotable.directive';

import { FileStorage } from './class/core/file-storage/file-storage';
import { ImageFile } from './class/core/file-storage/image-file';

let markedRenderer = new MarkedRenderer();
markedRenderer.image = function (href: string, title: string, text: string): string {
  // IdentifierをURLに変換
  if (href.indexOf('image:') === 0) {
    let file: ImageFile = FileStorage.instance.get(href.replace('image:', ''));
    if (file) {
      href = file.url;
    }
  } 
  let out = '<img src="' + href + '" alt="' + text + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += '>';
  return out;
};
markedRenderer.link = function(href, title, text) {
  // 必ずサニタイズでいいよね
  try {
    var prot = decodeURIComponent(href)
      .replace(/[^\w:]/g, '')
      .toLowerCase();
  } catch (e) {
    return text;
  }
  if (prot.indexOf('javascript:') === 0 || prot.indexOf('vbscript:') === 0 || prot.indexOf('data:') === 0) {
    return text;
  }
  
  if (text.indexOf('^') === 0) {
    return '<sup title="" data-balloon-length="medium" data-balloon-pos="up-left" data-balloon="' + href + '">' + text.replace(/^\^/, '') + '</sup>';
  }
  
  // target="_blank"
  var out = '<a' + ((href.indexOf('mailto:') < 0) ? ' target="_blank"' : '') + ' href="' + href + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += '>' + text + '</a>';
  return out;
};

@NgModule({
  declarations: [
    AppComponent,
    CardComponent,
    CardStackComponent,
    CardStackListComponent,
    ChatMessageComponent,
    ChatPaletteComponent,
    ChatTabComponent,
    ChatTabSettingComponent,
    ChatWindowComponent,
    ContextMenuComponent,
    FileSelecterComponent,
    FileStorageComponent,
    GameCharacterGeneratorComponent,
    GameCharacterSheetComponent,
    GameCharacterComponent,
    GameDataElementComponent,
    GameObjectInventoryComponent,
    GameTableMaskComponent,
    GameTableSettingComponent,
    GameTableComponent,
    JukeboxComponent,
    LobbyComponent,
    ModalComponent,
    PasswordCheckComponent,
    PeerMenuComponent,
    RoomSettingComponent,
    UIPanelComponent,
    SafePipe,
    ChatPaletteComponent,
    TextViewComponent,
    TerrainComponent,
    PeerCursorComponent,
    TextNoteComponent,
    MovableDirective,
    RotableDirective,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    HttpModule,
    MarkdownModule.forRoot({
      provide: MarkedOptions,
      useValue: {
        gfm: true,
        headerIds: false,
        sanitize: true,
        smartLists: true,
        smartypants: true,
        renderer: markedRenderer
      }
    })
  ],
  providers: [
    AppConfigService,
    ChatMessageService,
    ContextMenuService,
    ModalService,
    PanelService,
    PointerDeviceService,
    TabletopService,
  ],
  entryComponents: [
    ModalComponent,
    UIPanelComponent,
    PasswordCheckComponent,
    PeerMenuComponent,
    GameObjectInventoryComponent,
    ChatPaletteComponent,
    CardStackListComponent,
    ChatTabSettingComponent,
    ChatWindowComponent,
    ContextMenuComponent,
    GameTableSettingComponent,
    FileSelecterComponent,
    FileStorageComponent,
    GameCharacterSheetComponent,
    GameCharacterGeneratorComponent,
    JukeboxComponent,
    LobbyComponent,
    RoomSettingComponent,
    TextViewComponent,
    TextNoteComponent,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
