/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$setPrefixes', '$set1Deck2Jokers', '$cardTrader', '$card_place=', '$canTapCard=', '$debug', '$gsub', '$check_barna_kronika', '$=~', '$collect', '$to_i', '$split', '$==', '$roll_barna_kronika', '$+', '$>', '$times', '$rand', '$[]=', '$[]', '$isCriticalCall', '$getAttackStringWhenCriticalCall', '$isNomalAtack', '$getAttackStringWhenNomal', '$!=', '$-', '$*', '$<', '$sub', '$getAtackHitLocation', '$get_table_by_number']);
  return (function($base, $super) {
    function $BarnaKronika(){};
    var self = $BarnaKronika = $klass($base, $super, 'BarnaKronika', $BarnaKronika);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_10, TMP_11, TMP_13, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22;

    def.isBattleMode = def.nick_e = nil;
    self.$setPrefixes(["\\d+BK", "\\d+BA", "\\d+BKC\\d+", "\\d+BAC\\d+"]);

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_1.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_1, false)), $a.$$p = $iter, $a).apply($b, $zuper);
      self.sendMode = 2;
      return self.sortType = 3;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$postSet', TMP_2 = function $$postSet() {
      var $a, $b, $c, self = this;

      if ((($a = (($b = Opal.cvars['@@bcdice']) == null ? nil : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$cardTrader().$set1Deck2Jokers();
        (($a = [0]), $b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c).$cardTrader(), $b['$card_place='].apply($b, $a), $a[$a.length-1]);
        return (($a = [false]), $b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c).$cardTrader(), $b['$canTapCard='].apply($b, $a), $a[$a.length-1]);
        } else {
        return nil
      };
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_3 = function $$gameName() {
      var self = this;

      return "バルナ・クロニカ";
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$gameType', TMP_4 = function $$gameType() {
      var self = this;

      return "BarnaKronika";
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_5 = function $$getHelpMessage() {
      var self = this;

      return "・通常判定　nBK\n　ダイス数nで判定ロールを行います。\n　セット数が1以上の時はセット数も表示します。\n・攻撃判定　nBA\n　ダイス数nで判定ロールを行い、攻撃値と命中部位も表示します。\n・クリティカルコール　nBKCt　nBACt\n　判定コマンドの後ろに「Ct」を付けるとクリティカルコールです。\n　ダイス数n,コール数tで判定ロールを行います。\n　ダイス数nで判定ロールを行います。\n　セット数が1以上の時はセット数も表示し、攻撃判定の場合は命中部位も表示します。\n";
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$changeText', TMP_10 = function $$changeText(string) {
      var $a, $b, TMP_6, $c, TMP_7, $d, TMP_8, $e, TMP_9, self = this;

      self.$debug("parren_killer_add begin string", string);
      string = ($a = ($b = string).$gsub, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this, $c;

      return "" + ((($c = $gvars['~']) === nil ? nil : $c['$[]'](1))) + "R6[0," + ((($c = $gvars['~']) === nil ? nil : $c['$[]'](2))) + "]"}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6), $a).call($b, /(\d+)BKC(\d)/);
      string = ($a = ($c = string).$gsub, $a.$$p = (TMP_7 = function(){var self = TMP_7.$$s || this, $d;

      return "" + ((($d = $gvars['~']) === nil ? nil : $d['$[]'](1))) + "R6[1," + ((($d = $gvars['~']) === nil ? nil : $d['$[]'](2))) + "]"}, TMP_7.$$s = self, TMP_7.$$arity = 0, TMP_7), $a).call($c, /(\d+)BAC(\d)/);
      string = ($a = ($d = string).$gsub, $a.$$p = (TMP_8 = function(){var self = TMP_8.$$s || this, $e;

      return "" + ((($e = $gvars['~']) === nil ? nil : $e['$[]'](1))) + "R6[0,0]"}, TMP_8.$$s = self, TMP_8.$$arity = 0, TMP_8), $a).call($d, /(\d+)BK/);
      string = ($a = ($e = string).$gsub, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this, $f;

      return "" + ((($f = $gvars['~']) === nil ? nil : $f['$[]'](1))) + "R6[1,0]"}, TMP_9.$$s = self, TMP_9.$$arity = 0, TMP_9), $a).call($e, /(\d+)BA/);
      self.$debug("parren_killer_add end string", string);
      return string;
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$dice_command_xRn', TMP_11 = function $$dice_command_xRn(string, nick_e) {
      var self = this;

      self.nick_e = nick_e;
      return self.$check_barna_kronika(string);
    }, TMP_11.$$arity = 2);

    Opal.defn(self, '$check_barna_kronika', TMP_13 = function $$check_barna_kronika(string) {
      var $a, $b, $c, $d, TMP_12, self = this, output = nil, option = nil, dice_n = nil, criticalCallDice = nil, battleModeText = nil, dice_str = nil, suc = nil, set = nil, at_str = nil;

      output = "1";
      if ((($a = (/(^|\s)S?((\d+)[rR]6(\[([,\d]+)\])?)(\s|$)/i['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      option = (($a = $gvars['~']) === nil ? nil : $a['$[]'](5));
      dice_n = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      ((($a = dice_n) !== false && $a !== nil && $a != null) ? $a : dice_n = 1);
      self.isBattleMode = false;
      criticalCallDice = 0;
      if ((($a = (option)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $b = ($c = ($d = option.$split(",")).$collect, $c.$$p = (TMP_12 = function(i){var self = TMP_12.$$s || this;
if (i == null) i = nil;
        return i.$to_i()}, TMP_12.$$s = self, TMP_12.$$arity = 1, TMP_12), $c).call($d), $a = Opal.to_ary($b), battleModeText = ($a[0] == null ? nil : $a[0]), criticalCallDice = ($a[1] == null ? nil : $a[1]), $b;
        self.isBattleMode = (battleModeText['$=='](1));};
      self.$debug("@isBattleMode", self.isBattleMode);
      $b = self.$roll_barna_kronika(dice_n, criticalCallDice), $a = Opal.to_ary($b), dice_str = ($a[0] == null ? nil : $a[0]), suc = ($a[1] == null ? nil : $a[1]), set = ($a[2] == null ? nil : $a[2]), at_str = ($a[3] == null ? nil : $a[3]), $b;
      output = "" + (self.nick_e) + ": (" + (string) + ") ＞ [" + (dice_str) + "] ＞ ";
      if ((($a = (self.isBattleMode)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, at_str)
        } else {
        self.$debug("suc", suc);
        if ((($a = ($rb_gt(suc, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = $rb_plus(output, "成功数" + (suc))
          } else {
          output = $rb_plus(output, "失敗")
        };
        self.$debug("set", set);
        if ((($a = ($rb_gt(set, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = $rb_plus(output, ",セット" + (set))};
      };
      return output;
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$roll_barna_kronika', TMP_17 = function $$roll_barna_kronika(dice_n, criticalCallDice) {
      var $a, $b, TMP_14, $c, TMP_15, $d, self = this, output = nil, suc = nil, set = nil, at_str = nil, diceCountList = nil, c_cnt = nil;

      dice_n = dice_n.$to_i();
      output = "";
      suc = 0;
      set = 0;
      at_str = "";
      diceCountList = [0, 0, 0, 0, 0, 0];
      ($a = ($b = dice_n).$times, $a.$$p = (TMP_14 = function(i){var self = TMP_14.$$s || this, $c, $d, index = nil;
if (i == null) i = nil;
      index = self.$rand(6);
        ($c = index, $d = diceCountList, $d['$[]=']($c, $rb_plus($d['$[]']($c), 1)));
        if ((($c = ($rb_gt(diceCountList['$[]'](index), suc))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return suc = diceCountList['$[]'](index)
          } else {
          return nil
        };}, TMP_14.$$s = self, TMP_14.$$arity = 1, TMP_14), $a).call($b);
      ($a = ($c = (6)).$times, $a.$$p = (TMP_15 = function(i){var self = TMP_15.$$s || this, $d, $e, TMP_16, diceCount = nil;
if (i == null) i = nil;
      diceCount = diceCountList['$[]'](i);
        if ((($d = (diceCount['$=='](0))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          return nil;};
        ($d = ($e = diceCount).$times, $d.$$p = (TMP_16 = function(j){var self = TMP_16.$$s || this;
if (j == null) j = nil;
        return output = $rb_plus(output, "" + ($rb_plus(i, 1)) + ",")}, TMP_16.$$s = self, TMP_16.$$arity = 1, TMP_16), $d).call($e);
        if ((($d = (self.$isCriticalCall(i, criticalCallDice))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          self.$debug("isCriticalCall");
          at_str = $rb_plus(at_str, self.$getAttackStringWhenCriticalCall(i, diceCount));
        } else if ((($d = (self.$isNomalAtack(criticalCallDice, diceCount))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          self.$debug("isNomalAtack");
          at_str = $rb_plus(at_str, self.$getAttackStringWhenNomal(i, diceCount));};
        if ((($d = ($rb_gt(diceCount, 1))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          return set = $rb_plus(set, 1)
          } else {
          return nil
        };}, TMP_15.$$s = self, TMP_15.$$arity = 1, TMP_15), $a).call($c);
      if ((($a = (criticalCallDice['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        c_cnt = diceCountList['$[]']($rb_minus(criticalCallDice, 1));
        suc = $rb_times(c_cnt, 2);
        if ((($a = (c_cnt['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          set = 1
          } else {
          set = 0
        };};
      if ((($a = (($d = self.isBattleMode, $d !== false && $d !== nil && $d != null ?$rb_lt(suc, 2) : $d))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        at_str = "失敗"};
      output = output.$sub(/,$/, "");
      at_str = at_str.$sub(/,$/, "");
      return [output, suc, set, at_str];
    }, TMP_17.$$arity = 2);

    Opal.defn(self, '$isCriticalCall', TMP_18 = function $$isCriticalCall(index, criticalCallDice) {
      var $a, self = this;

      if ((($a = (self.isBattleMode)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      if ((($a = (criticalCallDice['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return false};
      return (criticalCallDice['$=='](($rb_plus(index, 1))));
    }, TMP_18.$$arity = 2);

    Opal.defn(self, '$isNomalAtack', TMP_19 = function $$isNomalAtack(criticalCallDice, diceCount) {
      var $a, self = this;

      if ((($a = (self.isBattleMode)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      if ((($a = (criticalCallDice['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return false};
      return ($rb_gt(diceCount, 1));
    }, TMP_19.$$arity = 2);

    Opal.defn(self, '$getAttackStringWhenCriticalCall', TMP_20 = function $$getAttackStringWhenCriticalCall(index, diceCount) {
      var self = this, hitLocation = nil, atackValue = nil, result = nil;

      hitLocation = self.$getAtackHitLocation($rb_plus(index, 1));
      atackValue = ($rb_times(diceCount, 2));
      result = $rb_plus(hitLocation, ":攻撃値" + (atackValue) + ",");
      return result;
    }, TMP_20.$$arity = 2);

    Opal.defn(self, '$getAttackStringWhenNomal', TMP_21 = function $$getAttackStringWhenNomal(index, diceCount) {
      var self = this, hitLocation = nil, atackValue = nil, result = nil;

      hitLocation = self.$getAtackHitLocation($rb_plus(index, 1));
      atackValue = diceCount;
      result = $rb_plus(hitLocation, ":攻撃値" + (atackValue) + ",");
      return result;
    }, TMP_21.$$arity = 2);

    return (Opal.defn(self, '$getAtackHitLocation', TMP_22 = function $$getAtackHitLocation(num) {
      var self = this, table = nil;

      table = [[1, "頭部"], [2, "右腕"], [3, "左腕"], [4, "右脚"], [5, "左脚"], [6, "胴体"]];
      return self.$get_table_by_number(num, table);
    }, TMP_22.$$arity = 1), nil) && 'getAtackHitLocation';
  })($scope.base, $scope.get('DiceBot'))
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);