import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, NgZone, Input, ViewChild, AfterViewInit, ElementRef, HostListener } from '@angular/core';

import { TextViewComponent } from '../text-view/text-view.component';

import { ModalService } from '../../service/modal.service';
import { PanelService, PanelOption } from '../../service/panel.service';
import { PointerDeviceService } from '../../service/pointer-device.service';
import { ChatMessageService } from '../../service/chat-message.service';

import { ChatTab } from '../../class/chat-tab';
import { ChatPalette } from '../../class/chat-palette';
import { ChatMessage, ChatMessageContext } from '../../class/chat-message';
import { PeerCursor } from '../../class/peer-cursor';
import { DiceBot } from '../../class/dice-bot';
import { GameCharacter, GameCharacterContainer } from '../../class/game-character';
import { Network, EventSystem } from '../../class/core/system/system';
import { PeerContext } from '../../class/core/system/network/peer-context';
import { ObjectStore } from '../../class/core/synchronize-object/object-store';
import { ImageFile } from '../../class/core/file-storage/image-file';

@Component({
  selector: 'chat-palette',
  templateUrl: './chat-palette.component.html',
  styleUrls: ['./chat-palette.component.css']
})
export class ChatPaletteComponent implements OnInit {
  @Input() character: GameCharacter = null;

  get palette(): ChatPalette { return this.character.chatPalette; }
  sendTo: string = '';
  get isDirect(): boolean { return this.sendTo != null && this.sendTo.length ? true : false }
  private _gameType: string = '';
  get gameType(): string { return this._gameType };
  set gameType(gameType: string) {
    this._gameType = gameType;
    if (this.character.chatPalette) this.character.chatPalette.dicebot = gameType;
  };
  chatTabidentifier: string = '';
  text: string = '';

  isEdit: boolean = false;
  editPalette: string = '';

  private doubleClickTimer: NodeJS.Timer = null;

  get diceBotInfos() { return DiceBot.diceBotInfos }

  get chatTab(): ChatTab { return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier); }
  get myPeer(): PeerCursor { return PeerCursor.myCursor; }
  get otherPeers(): PeerCursor[] { return ObjectStore.instance.getObjects(PeerCursor); }

  constructor(
    private ngZone: NgZone,
    //private gameRoomService: GameRoomService,
    //private contextMenuService: ContextMenuService,
    //private modalService: ModalService,
    public chatMessageService: ChatMessageService,
    private panelService: PanelService,
    private elementRef: ElementRef,
    private changeDetector: ChangeDetectorRef,
    private pointerDeviceService: PointerDeviceService
  ) { }

  ngOnInit() {
    this.panelService.title = 'チャットパレット - ' + this.character.name;
    this.chatTabidentifier = this.chatMessageService.chatTabs ? this.chatMessageService.chatTabs[0].identifier : '';
    this.gameType = this.character.chatPalette ? this.character.chatPalette.dicebot : '';
    EventSystem.register(this)
      .on('CLOSE_OTHER_PEER', event => {
        let object = ObjectStore.instance.get(this.sendTo);
        if (object instanceof PeerCursor && object.peerId === event.data.peer) {
          this.sendTo = '';
        }
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  selectPalette(line: string) {
    if (this.doubleClickTimer && this.text === line) {
      clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
      this.sendChat();
    } else {
      this.text = line;
      this.doubleClickTimer = setTimeout(() => { this.doubleClickTimer = null }, 400);
    }
  }

  onChangeGameType(gameType: string) {
    console.log('onChangeGameType ready');
    DiceBot.getHelpMessage(this.gameType).then(help => {
      console.log('onChangeGameType done\n' + help);
    });
  }

  showDicebotHelp() {
    DiceBot.getHelpMessage(this.gameType).then(help => {
      let gameName: string = 'ダイスボット';
      for (let diceBotInfo of DiceBot.diceBotInfos) {
        if (diceBotInfo.script === this.gameType) {
          gameName = 'ダイスボット ＜' + diceBotInfo.game + '＞'
        }
      }
      gameName += 'の説明';

      let coordinate = this.pointerDeviceService.pointers[0];
      let option: PanelOption = { left: coordinate.x, top: coordinate.y, width: 600, height: 500 };
      let textView = this.panelService.open(TextViewComponent, option);
      textView.title = gameName;
      textView.text = help;
      console.log('onChangeGameType done');
    });
  }

  sendChat() {
    if (!this.text.length) return;

    let time = this.chatMessageService.getTime();
    console.log('time:' + time);
    let chatMessage: ChatMessageContext = {
      from: Network.peerContext.id,
      name: this.character.name,
      text: this.palette.evaluate(this.text, this.character.rootDataElement),
      timestamp: time,
      tag: this.gameType,
      imageIdentifier: this.character.imageFile ? this.character.imageFile.identifier : '',
      responseIdentifier: '',
    };

    if (this.sendTo != null && this.sendTo.length) {
      let name = '';
      let object = ObjectStore.instance.get(this.sendTo);
      if (object instanceof GameCharacter) {
        name = object.name;
        chatMessage.to = object.identifier;
      } else if (object instanceof PeerCursor) {
        name = object.name;
        let peer = PeerContext.create(object.peerId);
        if (peer) chatMessage.to = peer.id;
      }
      chatMessage.name += ' > ' + name;
    }

    if (this.chatTab) this.chatTab.addMessage(chatMessage);
    this.text = '';
  }

  toggleEditMode() {
    this.isEdit = this.isEdit ? false : true;
    if (this.isEdit) {
      this.editPalette = this.palette.value + '';
    } else {
      this.palette.setPalette(this.editPalette);
    }
  }
}
