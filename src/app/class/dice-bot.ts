import { ChatMessage, ChatMessageContext } from './chat-message';
import { Network, EventSystem } from './core/system/system';
import { ObjectStore } from './core/synchronize-object/object-store';
import { SyncObject } from './core/synchronize-object/anotation';
import { GameObject } from './core/synchronize-object/game-object';
import { ChatTab } from './chat-tab';

declare var Opal

type Callback<T> = () => T;

class PromiseQueue {
  private length: number = 0;
  private queue: Promise<any> = Promise.resolve();

  add<T>(task: Callback<T>): Promise<T> {
    this.length++
    console.log('PromiseQueue Add:' + this.length)
    this.queue = this.queue.then(task);
    let ret = this.queue;
    this.queue = this.queue.catch((reason) => {
      console.error(reason);
    });
    this.queue = this.queue.then(() => {
      this.length--;
      console.log('PromiseQueue Done:' + this.length);
    });
    return ret;
  }
}

@SyncObject('dice-bot')
export class DiceBot extends GameObject {
  private static loadedDiceBots: { [gameType: string]: boolean } = {};
  private static queue: PromiseQueue = new PromiseQueue();
  private static url: string = null;

  public static diceBotInfos: DiceBotInfo[] = [
    { script: 'EarthDawn', game: 'アースドーン' },
    { script: 'EarthDawn3', game: 'アースドーン3版' },
    { script: 'EarthDawn4', game: 'アースドーン4版' },
    { script: 'Airgetlamh', game: '朱の孤塔のエアゲトラム' },
    { script: 'Amadeus', game: 'アマデウス' },
    { script: 'Arianrhod', game: 'アリアンロッド' },
    { script: 'Alshard', game: 'アルシャード' },
    { script: 'ArsMagica', game: 'アルスマギカ' },
    { script: 'IthaWenUa', game: 'イサー・ウェン＝アー' },
    { script: 'Insane', game: 'インセイン' },
    { script: 'WitchQuest', game: 'ウィッチクエスト' },
    { script: 'Warhammer', game: 'ウォーハンマー' },
    { script: 'Utakaze', game: 'ウタカゼ' },
    { script: 'Alsetto', game: '詩片のアルセット' },
    { script: 'AceKillerGene', game: 'エースキラージーン' },
    { script: 'EclipsePhase', game: 'エクリプス・フェイズ' },
    { script: 'Elysion', game: 'エリュシオン' },
    { script: 'Elric', game: 'エルリック！' },
    { script: 'EmbryoMachine', game: 'エムブリオマシン' },
    { script: 'EndBreaker', game: 'エンドブレイカー' },
    { script: 'Oukahoushin3rd', game: '央華封神RPG第三版' },
    { script: 'GardenOrder', game: 'ガーデンオーダー' },
    { script: 'CardRanker', game: 'カードランカー' },
    { script: 'Gurps', game: 'ガープス' },
    { script: 'GurpsFW', game: 'ガープスフィルトウィズ' },
    { script: 'ChaosFlare', game: 'カオスフレア' },
    { script: 'OneWayHeroics', game: '片道勇者' },
    { script: 'Kamigakari', game: '神我狩' },
    { script: 'Garako', game: 'ガラコと破界の塔' },
    { script: 'KanColle', game: '艦これRPG' },
    { script: 'Gundog', game: 'ガンドッグ' },
    { script: 'GundogZero', game: 'ガンドッグ・ゼロ' },
    { script: 'GundogRevised', game: 'ガンドッグ・リヴァイズド' },
    { script: 'KillDeathBusiness', game: 'キルデスビジネス' },
    { script: 'Cthulhu', game: 'クトゥルフ' },
    { script: 'Cthulhu7th', game: 'クトゥルフ第7版' },
    { script: 'CthulhuTech', game: 'クトゥルフテック' },
    { script: 'KurayamiCrying', game: 'クラヤミクライン' },
    { script: 'GranCrest', game: 'グランクレスト' },
    { script: 'GeishaGirlwithKatana', game: 'ゲイシャ・ガール・ウィズ・カタナ' },
    { script: 'GehennaAn', game: 'ゲヘナ・アナスタシス' },
    { script: 'CodeLayerd', game: 'コード：レイヤード' },
    { script: 'Avandner', game: '黒絢のアヴァンドナー' },
    { script: 'Gorilla', game: 'ゴリラTRPG' },
    { script: 'ColossalHunter', game: 'コロッサルハンター' },
    { script: 'Satasupe', game: 'サタスペ' },
    { script: 'SharedFantasia', game: 'Shared†Fantasia' },
    { script: 'JamesBond', game: 'ジェームズ・ボンド007' },
    { script: 'LiveraDoll', game: '紫縞のリヴラドール' },
    { script: 'ShinobiGami', game: 'シノビガミ' },
    { script: 'ShadowRun', game: 'シャドウラン' },
    { script: 'ShadowRun4', game: 'シャドウラン第４版' },
    { script: 'ShoujoTenrankai', game: '少女展爛会' },
    { script: 'ShinkuuGakuen', game: '真空学園' },
    { script: 'ShinMegamiTenseiKakuseihen', game: '真・女神転生TRPG　覚醒編' },
    { script: 'SRS', game: 'Standard RPG System' },
    { script: 'TherapieSein', game: '青春疾患セラフィザイン' },
    { script: 'EtrianOdysseySRS', game: '世界樹の迷宮SRS' },
    { script: 'ZettaiReido', game: '絶対隷奴' },
    { script: 'SevenFortressMobius', game: 'セブン＝フォートレス メビウス' },
    { script: 'SwordWorld', game: 'ソードワールド' },
    { script: 'SwordWorld2_0', game: 'ソードワールド2.0' },
    { script: 'DarkSouls', game: 'ダークソウルTRPG' },
    { script: 'DarkDaysDrive', game: 'ダークデイズドライブ' },
    { script: 'DarkBlaze', game: 'ダークブレイズ' },
    { script: 'DungeonsAndDoragons', game: 'ダンジョンズ＆ドラゴンズ' },
    { script: 'DiceOfTheDead', game: 'ダイス・オブ・ザ・デッド' },
    { script: 'DoubleCross', game: 'ダブルクロス2nd,3rd' },
    { script: 'CrashWorld', game: '墜落世界' },
    { script: 'StrangerOfSwordCity', game: '剣の街の異邦人TRPG' },
    { script: 'DetatokoSaga', game: 'でたとこサーガ' },
    { script: 'DeadlineHeroes', game: 'デッドラインヒーローズ' },
    { script: 'DemonParasite', game: 'デモンパラサイト' },
    { script: 'TokyoNova', game: 'トーキョーＮ◎ＶＡ' },
    { script: 'Torg', game: 'トーグ' },
    { script: 'Torg1_5', game: 'トーグ1.5版' },
    { script: 'TokumeiTenkousei', game: '特命転攻生' },
    { script: 'Dracurouge', game: 'ドラクルージュ' },
    { script: 'TwilightGunsmoke', game: 'トワイライト・ガンスモーク' },
    { script: 'TunnelsAndTrolls', game: 'トンネルズ＆トロールズ' },
    { script: 'NightWizard', game: 'ナイトウィザード2版' },
    { script: 'NightWizard3rd', game: 'ナイトウィザード3版' },
    { script: 'NightmareHunterDeep', game: 'ナイトメアハンター=ディープ' },
    { script: 'Nuekagami', game: '鵺鏡' },
    { script: 'Nechronica', game: 'ネクロニカ' },
    { script: 'HarnMaster', game: 'ハーンマスター' },
    { script: 'Skynauts', game: '歯車の塔の探空士' },
    { script: 'HatsuneMiku', game: '初音ミクTRPG ココロダンジョン' },
    { script: 'BattleTech', game: 'バトルテック' },
    { script: 'ParasiteBlood', game: 'パラサイトブラッド' },
    { script: 'Paranoia', game: 'パラノイア' },
    { script: 'BarnaKronika', game: 'バルナ・クロニカ' },
    { script: 'BadLife', game: '犯罪活劇RPGバッドライフ' },
    { script: 'HuntersMoon', game: 'ハンターズムーン' },
    { script: 'Peekaboo', game: 'ピーカーブー' },
    { script: 'BeastBindTrinity', game: 'ビーストバインド トリニティ' },
    { script: 'BeginningIdol', game: 'ビギニングアイドル' },
    { script: 'PhantasmAdventure', game: 'ファンタズムアドベンチャー' },
    { script: 'FilledWith', game: 'フィルトウィズ' },
    { script: 'BlindMythos', game: 'ブラインド・ミトス' },
    { script: 'BloodCrusade', game: 'ブラッド・クルセイド' },
    { script: 'BloodMoon', game: 'ブラッド・ムーン' },
    { script: 'FullMetalPanic', game: 'フルメタル・パニック！' },
    { script: 'BladeOfArcana', game: 'ブレイド・オブ・アルカナ' },
    { script: 'Strave', game: '碧空のストレイヴ' },
    { script: 'Pendragon', game: 'ペンドラゴン' },
    { script: 'HouraiGakuen', game: '蓬莱学園の冒険!!' },
    { script: 'MagicaLogia', game: 'マギカロギア' },
    { script: 'MeikyuDays', game: '迷宮デイズ' },
    { script: 'MeikyuKingdom', game: '迷宮キングダム' },
    { script: 'MetallicGuadian', game: 'メタリックガーディアン' },
    { script: 'MetalHead', game: 'メタルヘッド' },
    { script: 'MetalHeadExtream', game: 'メタルヘッドエクストリーム' },
    { script: 'MonotoneMusium', game: 'モノトーン・ミュージアム' },
    { script: 'YankeeYogSothoth', game: 'ヤンキー＆ヨグ＝ソトース' },
    { script: 'GoldenSkyStories', game: 'ゆうやけこやけ' },
    { script: 'Ryutama', game: 'りゅうたま' },
    { script: 'RuneQuest', game: 'ルーンクエスト' },
    { script: 'LogHorizon', game: 'ログ・ホライズン' },
    { script: 'RokumonSekai2', game: '六門世界2nd' },
    { script: 'RoleMaster', game: 'ロールマスター' },
    { script: 'LostRoyal', game: 'ロストロイヤル' },
    { script: 'WaresBlade', game: 'ワースブレイド' },
    { script: 'WARPS', game: 'ワープス' },
    { script: 'Hieizan', game: '比叡山炎上' },
    { script: 'InfiniteFantasia', game: '無限のファンタジア' },
    { script: 'Chill', game: 'Chill' },
    { script: 'Chill3', game: 'Chill 3' },
    { script: 'NjslyrBattle', game: 'NJSLYRBATTLE' },
    { script: 'Pathfinder', game: 'Pathfinder' }
  ];

  public static extratablesTables: string[] = [
    'BloodCrusade_TD2T.txt',
    'BloodCrusade_TD3T.txt',
    'BloodCrusade_TD4T.txt',
    'BloodCrusade_TD5T.txt',
    'BloodCrusade_TD6T.txt',
    'BloodCrusade_TDHT.txt',
    'BloodMoon_ID2T.txt',
    'BloodMoon_IDT.txt',
    'BloodMoon_RAT.txt',
    'CardRanker_BFT.txt',
    'CardRanker_CDT.txt',
    'CardRanker_CST.txt',
    'CardRanker_DT.txt',
    'CardRanker_GDT.txt',
    'CardRanker_OST.txt',
    'CardRanker_SST.txt',
    'CardRanker_ST.txt',
    'CardRanker_TDT.txt',
    'CardRanker_WT.txt',
    'Elysion_EBT.txt',
    'Elysion_GIT.txt',
    'Elysion_HBT.txt',
    'Elysion_HT.txt',
    'Elysion_IT.txt',
    'Elysion_JH.txt',
    'Elysion_KT.txt',
    'Elysion_NA.txt',
    'Elysion_NT.txt',
    'Elysion_OJ1.txt',
    'Elysion_OJ2.txt',
    'Elysion_TBT.txt',
    'Elysion_UBT.txt',
    'Elysion_UT1.txt',
    'Elysion_UT2.txt',
    'Elysion_UT3.txt',
    'Elysion_UT4.txt',
    'HuntersMoon_DS1ET.txt',
    'HuntersMoon_DS2ET.txt',
    'HuntersMoon_DS3ET.txt',
    'HuntersMoon_EE1ET.txt',
    'HuntersMoon_EE2ET.txt',
    'HuntersMoon_EE3ET.txt',
    'HuntersMoon_ERT.txt',
    'HuntersMoon_ET1ET.txt',
    'HuntersMoon_ET2ET.txt',
    'HuntersMoon_ET3ET.txt',
    'HuntersMoon_MST.txt',
    'HuntersMoon_TK1ET.txt',
    'HuntersMoon_TK2ET.txt',
    'HuntersMoon_TK3ET.txt',
    'Kamigakari_ET.txt',
    'Kamigakari_KT.txt',
    'Kamigakari_NT.txt',
    'KanColle_BT2.txt',
    'KanColle_BT3.txt',
    'KanColle_BT4.txt',
    'KanColle_BT5.txt',
    'KanColle_BT6.txt',
    'KanColle_BT7.txt',
    'KanColle_BT8.txt',
    'KanColle_BT9.txt',
    'KanColle_BT10.txt',
    'KanColle_BT11.txt',
    'KanColle_BT12.txt',
    'KanColle_ETIT.txt',
    'KanColle_LFDT.txt',
    'KanColle_LFVT.txt',
    'KanColle_LSFT.txt',
    'KanColle_WPCN.txt',
    'KanColle_WPFA.txt',
    'KanColle_WPMC.txt',
    'KanColle_WPMCN.txt',
    'KillDeathBusiness_ANSPT.txt',
    'KillDeathBusiness_MASPT.txt',
    'KillDeathBusiness_MOSPT.txt',
    'KillDeathBusiness_PASPT.txt',
    'KillDeathBusiness_POSPT.txt',
    'KillDeathBusiness_UMSPT.txt',
    'Oukahoushin3rd_BKT.txt',
    'Oukahoushin3rd_KKT.txt',
    'Oukahoushin3rd_NHT.txt',
    'Oukahoushin3rd_SDT.txt',
    'Oukahoushin3rd_SKT.txt',
    'Oukahoushin3rd_STT.txt',
    'Oukahoushin3rd_UKT.txt',
    'ShinobiGami_AKST.txt',
    'ShinobiGami_CLST.txt',
    'ShinobiGami_DXST.txt',
    'ShinobiGami_HC.txt',
    'ShinobiGami_HK.txt',
    'ShinobiGami_HLST.txt',
    'ShinobiGami_HM.txt',
    'ShinobiGami_HO.txt',
    'ShinobiGami_HR.txt',
    'ShinobiGami_HS.txt',
    'ShinobiGami_HT.txt',
    'ShinobiGami_HY.txt',
    'ShinobiGami_NTST.txt',
    'ShinobiGami_OTKRT.txt',
    'ShinobiGami_PLST.txt',
    'BloodCrusade_BDST.txt',
    'BloodCrusade_CYST.txt',
    'BloodCrusade_DMST.txt',
    'BloodCrusade_MNST.txt',
    'BloodCrusade_SLST.txt',
    'BloodCrusade_TD1T.txt'
  ];

  initialize(needUpdate: boolean = true) {
    super.initialize(needUpdate);
    //DiceBot.queue.add(() => DiceBot.loadScriptAsync('./assets/bcdice.js'));
    DiceBot.queue.add(() => DiceBot.loadScriptAsync('./assets/cgiDiceBot.js'));
    EventSystem.register(this)
      .on<ChatMessageContext>('BROADCAST_MESSAGE', 100, async event => {
        if (!event.isSendFromSelf) return;
        let chatMessage = ObjectStore.instance.get<ChatMessage>(event.data.identifier);
        if (!chatMessage || chatMessage.isSystem) return;
        console.log('BROADCAST_MESSAGE DiceBot...?');
        let text: string = chatMessage.text;

        text = text.replace(/[Ａ-Ｚａ-ｚ０-９！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝]/g, function (s) {
          return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        }).replace(/[“”]/g, '"')
        .replace(/’/g, "'")
        .replace(/‘/g, '`')
        .replace(/￥/g, '\\')
        .replace(/　/g, ' ')
        .replace(/[‐－―]/g, '-')
        .replace(/、/g, ',')
        .replace(/。/g, '.')
        .replace(/[～〜]/g, '~');

        let commands = text.trim().split(/\s+/);
        let count = 1;
        if (/^\d+$/.test(commands[0])) {
          // 複数回ロール、コマンドの先頭を取り除く
          count = parseInt(commands.shift(), 10);
        }
        // すべてBCDiceに投げずに回数が1回未満かchoice[]が含まれるか英数記号以外は門前払い
        if (!commands[0] || count < 1 || !(/choice\[.*\]/i.test(commands[0]) || /^[a-zA-Z0-9!-/:-@¥[-`{-~\}]+$/.test(commands[0]))) {
            return;
        }
        
        let gameType: string = chatMessage.tag;
        let resultFrom: string = (DiceBot.hasApiURL() ? 'BCDice-API' : 'System-BCDice');
        
        try {
          let results = [];
          let isSecret = false;
          for (let i = 1; i <= count; i++) {
            let rollResult = await DiceBot.diceRollAsync(commands[0], gameType);
            let result: string = rollResult.result;
            isSecret = rollResult.isSecret;
            if (result.length < 1) return;
            result = result.replace(/[＞]/g, function (s) {
              return '→';
            });
            result = (count === 1 ? '' : '#' + i + ' ') + result.trim();
            results.push(result);
          }

          let diceBotMessage: ChatMessageContext = {
            identifier: '',
            tabIdentifier: chatMessage.tabIdentifier,
            from: resultFrom,
            timestamp: chatMessage.timestamp + 2,
            imageIdentifier: '',
            tag: 'system',
            name: isSecret ? '<Secret-BCDice：' + chatMessage.name + '>（非公開）' : '<BCDice：' + chatMessage.name + '>',
            text: results.join("\r\n")
          };

          if (chatMessage.to != null && 0 < chatMessage.to.length) {
            diceBotMessage.to = chatMessage.to;
            if (chatMessage.to.indexOf(chatMessage.from) < 0) {
              diceBotMessage.to += ' ' + chatMessage.from;
            }
          }

          if (isSecret) {
            let secretDiceBotMessage: ChatMessageContext = {
              identifier: '',
              tabIdentifier: chatMessage.tabIdentifier,
              from: resultFrom,
              timestamp: chatMessage.timestamp + 1,
              imageIdentifier: '',
              tag: 'system',
              name: '<BCDice：' + chatMessage.name + '>',
              text: '(シークレットダイス)'
            };
            secretDiceBotMessage.to = diceBotMessage.to;
            diceBotMessage.to = chatMessage.from;
            diceBotMessage.responseIdentifier = event.data.identifier;
            diceBotMessage.tag += ' secret';
            EventSystem.call('BROADCAST_MESSAGE', secretDiceBotMessage);
          }

          EventSystem.call('BROADCAST_MESSAGE', diceBotMessage);
        } catch (e) {
          console.error(e);
        }
        return;
      });
  }

  static diceRollAsync(message: string, gameType: string): Promise<{ result: string, isSecret: boolean }> {
    if (DiceBot.hasApiURL()) {
      gameType = (gameType && gameType != '') ? gameType : 'DiceBot';
      return fetch(DiceBot.url + '/v1/diceroll?system=' + encodeURIComponent(gameType) + '&command=' + encodeURIComponent(message), {mode: 'cors'})
        .then(response => { return response.json() })
        .then(json => { 
          return json.ok ? {result: (gameType + ' ' + json.result) as string, isSecret: json.secret as boolean} : {result: '', isSecret: false}
        });
    } else {
      DiceBot.queue.add(() => DiceBot.loadDiceBotAsync(gameType));
      return DiceBot.queue.add(() => {
        if ('Opal' in window === false) {
          console.warn('Opal is not loaded...');
          return { result: '', isSecret: false };
        }
        let result = [];
        let dir = []
        let diceBotTablePrefix = 'diceBotTable_'
        let isNeedResult = true;
        try {
          let cgiDiceBot = Opal.get('CgiDiceBot').$new();
          result = cgiDiceBot.$roll(message, gameType, dir, diceBotTablePrefix, isNeedResult);
          console.log('diceRoll!!!', result);
          console.log('isSecret!!!', cgiDiceBot.isSecret);
          return { result: result[0], isSecret: cgiDiceBot.isSecret };
        } catch (e) {
          console.error(e);
        }
        return { result: '', isSecret: false };
      });
    }
  }

  static getHelpMessage(gameType: string): Promise<string> {
    if (DiceBot.hasApiURL()) {
      let promisise = [
        fetch(DiceBot.url + '/v1/systeminfo?system=DiceBot', {mode: 'cors'}).then(response => { return response.json() })
      ];
      if (gameType && gameType != 'DiceBot') {
        promisise.push(
          fetch(DiceBot.url + '/v1/systeminfo?system=' + encodeURIComponent(gameType), {mode: 'cors'}).then(response => { return response.json() })
        );
      }
      return Promise.all(promisise)
        .then(jsons => { return jsons.map(json => { return json.systeminfo.info.trim() }).join('\n===================================\n') });
    } else {
      DiceBot.queue.add(() => DiceBot.loadDiceBotAsync(gameType));
      return DiceBot.queue.add(() => {
        console.log('getHelpMessage');
        if ('Opal' in window === false) {
          console.warn('Opal is not loaded...');
          return '';
        }
        let help = '【ダイスボット】チャットにダイス用の文字を入力するとダイスロールが可能\n'
          + '入力例）２ｄ６＋１　攻撃！\n'
          + '出力例）2d6+1　攻撃！\n'
          + '　　　　  diceBot: (2d6) → 7\n'
          + '上記のようにダイス文字の後ろに空白を入れて発言する事も可能。\n'
          + '以下、使用例\n'
          + '　3D6+1>=9 ：3d6+1で目標値9以上かの判定\n'
          + '　1D100<=50 ：D100で50％目標の下方ロールの例\n'
          + '　3U6[5] ：3d6のダイス目が5以上の場合に振り足しして合計する(上方無限)\n'
          + '　3B6 ：3d6のダイス目をバラバラのまま出力する（合計しない）\n'
          + '　10B6>=4 ：10d6を振り4以上のダイス目の個数を数える\n'
          + '　(8/2)D(4+6)<=(5*3)：個数・ダイス・達成値には四則演算も使用可能\n'
          + '　C(10-4*3/2+2)：C(計算式）で計算だけの実行も可能\n'
          + '　choice[a,b,c]：列挙した要素から一つを選択表示。ランダム攻撃対象決定などに\n'
          + '　S3d6 ： 各コマンドの先頭に「S」を付けると他人結果の見えないシークレットロール\n'
          + '　3d6/2 ： ダイス出目を割り算（切り捨て）。切り上げは /2U、四捨五入は /2R。\n'
          + '　D66 ： D66ダイス。順序はゲームに依存。D66N：そのまま、D66S：昇順。'
        try {
          if (gameType && gameType != 'DiceBot') {
            let bcdice = Opal.get('CgiDiceBot').$new().$newBcDice();
            bcdice.$setGameByTitle(gameType);
            help += ('\n===================================\n' + bcdice.diceBot.$getHelpMessage());
            console.log('bot.getHelpMessage()!!!', help);
          }
        } catch (e) {
          console.error(e);
        }
        return help;
      });
    }
  }

  static loadDiceBotAsync(gameType: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log('loadDiceBotAsync');
      gameType = gameType.replace(/\./g, s => '_');

      if ((!gameType && gameType.length < 1) || DiceBot.loadedDiceBots[gameType]) {
        console.log(gameType + ' is loaded');
        resolve();
        return;
      }

      DiceBot.loadedDiceBots[gameType] = false;

      let promises: Promise<void>[] = [];
      let scriptPath = './assets/dicebot/' + gameType + '.js';

      promises.push(DiceBot.loadScriptAsync(scriptPath));

      for (let table of DiceBot.extratablesTables) {
        if (!table.indexOf(gameType)) {
          let path = './assets/extratables/' + table;
          promises.push(DiceBot.loadExtratablesAsync(path, table));
        }
      }

      Promise.all(promises).then(() => {
        DiceBot.loadedDiceBots[gameType] = true;
        resolve();
      });
    });
  }

  static setApiURL(url: string) {
    if (DiceBot.url !== url) console.log('BCDice-API URL Change');
    DiceBot.url = url;
  }
  
  static hasApiURL() {
    return (DiceBot.url && DiceBot.url !== '');
  }
  
  private static loadScriptAsync(path: string) {
    return new Promise<void>((resolve, reject) => {
      let head = document.head;
      let script = document.createElement('script');
      script.src = path;
      head.appendChild(script);

      script.onload = (e) => {
        if (head && script.parentNode) head.removeChild(script);
        console.log(path + ' is loading OK!!!');
        resolve();
      };

      script.onabort = (e) => {
        if (head && script.parentNode) head.removeChild(script);
        console.error(e);
        resolve();
      }

      script.onerror = (e) => {
        if (head && script.parentNode) head.removeChild(script);
        console.error(e);
        resolve();
      }
    });
  }

  private static loadExtratablesAsync(path: string, table: string) {
    return new Promise<void>((resolve, reject) => {
      let http = new XMLHttpRequest();
      http.open('get', path, true);
      http.onerror = (event) => {
        console.error(event);
        resolve();
      };
      http.onreadystatechange = (event) => {
        if (http.readyState !== 4) {
          return;
        }
        if (http.status === 200) {
          console.log(table + ' is loading OK!!!');
          let tableFileData = Opal.get('TableFileData');
          let array = /((.+)_(.+)).txt$/ig.exec(table);
          tableFileData.$setVirtualTableData(array[1], array[2], array[3], http.responseText);
        } else {
          console.warn(table + 'fail...? status:' + http.status);
        }
        resolve();
      };
      http.send(null);
    });
  }
}

export interface DiceBotInfo {
  script: string;
  game: string;
}

interface DiceBotStackContainer {
  originalString: string;
  operater: string;
  calculationResult: number;
  diplayResult: string;
}
