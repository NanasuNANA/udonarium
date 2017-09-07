/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$setPrefixes', '$debug', '$===', '$to_i', '$checkRoll', '$empty?', '$getValue', '$<', '$>', '$<<', '$roll', '$sort', '$collect', '$split', '$join', '$getRollResultString', '$getSuccessInfo', '$isDragonDice', '$[]', '$to_s', '$!=', '$>=', '$getDiceCountHash', '$each', '$<=', '$size', '$*', '$inject', '$isNomalDice', '$==', '$[]=', '$+', '$new', '$!']);
  return (function($base, $super) {
    function $Utakaze(){};
    var self = $Utakaze = $klass($base, $super, 'Utakaze', $Utakaze);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_8, TMP_9, TMP_11, TMP_13, TMP_14, TMP_15, TMP_16;

    def.arrayDragonDiceName = nil;
    self.$setPrefixes(["\\d*UK[@\\d]*.*"]);

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_1.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_1, false)), $a.$$p = $iter, $a).apply($b, $zuper);
      return self.arrayDragonDiceName = ["", "風", "雨", "雲", "影", "月", "歌"];
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_2 = function $$gameName() {
      var self = this;

      return "ウタカゼ";
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$gameType', TMP_3 = function $$gameType() {
      var self = this;

      return "Utakaze";
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_4 = function $$getHelpMessage() {
      var self = this;

      return "・行為判定ロール（nUK）\n  n個のサイコロで行為判定ロール。ゾロ目の最大個数を成功レベルとして表示。nを省略すると2UK扱い。\n  例）3UK ：サイコロ3個で行為判定\n  例）UK  ：サイコロ2個で行為判定\n  不等号用いた成否判定は現時点では実装してません。\n・クリティカルコール付き行為判定ロール（nUK@c or nUKc）\n　cに「龍のダイス目」を指定した行為判定ロール。\n  ゾロ目ではなく、cと同じ値の出目数x2が成功レベルとなります。\n  例）3UK@5 ：龍のダイス「月」でクリティカルコール宣言したサイコロ3個の行為判定\n";
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$isGetOriginalMessage', TMP_5 = function $$isGetOriginalMessage() {
      var self = this;

      return true;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$rollDiceCommand', TMP_6 = function $$rollDiceCommand(command) {
      var $a, $b, self = this, result = nil, $case = nil, base = nil, crit = nil, diff = nil;

      self.$debug("rollDiceCommand command", command);
      result = "";
      $case = command;if (/(\d+)?UK(\@?(\d))?(>=(\d+))?/i['$===']($case)) {base = (((($a = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1))) !== false && $a !== nil && $a != null) ? $a : 2)).$to_i();
      crit = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3)).$to_i();
      diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](5)).$to_i();
      result = self.$checkRoll(base, crit, diff);};
      if ((($a = result['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      return "" + (command) + " ＞ " + (result);
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$checkRoll', TMP_8 = function $$checkRoll(base, crit, diff) {
      var $a, $b, TMP_7, self = this, result = nil, _ = nil, diceText = nil, diceList = nil;

      if (diff == null) {
        diff = 0;
      }
      result = "";
      base = self.$getValue(base);
      crit = self.$getValue(crit);
      if ((($a = ($rb_lt(base, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return result};
      if ((($a = ($rb_gt(crit, 6))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        crit = 6};
      result['$<<']("(" + (base) + "d6)");
      $b = self.$roll(base, 6), $a = Opal.to_ary($b), _ = ($a[0] == null ? nil : $a[0]), diceText = ($a[1] == null ? nil : $a[1]), $b;
      diceList = ($a = ($b = diceText.$split(/,/)).$collect, $a.$$p = (TMP_7 = function(i){var self = TMP_7.$$s || this;
if (i == null) i = nil;
      return i.$to_i()}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7), $a).call($b).$sort();
      result['$<<'](" ＞ [" + (diceList.$join(",")) + "] ＞ ");
      result['$<<'](self.$getRollResultString(diceList, crit, diff));
      return result;
    }, TMP_8.$$arity = -3);

    Opal.defn(self, '$getRollResultString', TMP_9 = function $$getRollResultString(diceList, crit, diff) {
      var $a, $b, self = this, success = nil, maxnum = nil, setCount = nil, result = nil, diffSuccess = nil;

      $b = self.$getSuccessInfo(diceList, crit, diff), $a = Opal.to_ary($b), success = ($a[0] == null ? nil : $a[0]), maxnum = ($a[1] == null ? nil : $a[1]), setCount = ($a[2] == null ? nil : $a[2]), $b;
      result = "";
      if ((($a = (self.$isDragonDice(crit))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        result['$<<']("龍のダイス「" + (self.arrayDragonDiceName['$[]'](crit)) + "」(" + (crit.$to_s()) + ")を使用 ＞ ")};
      if ((($a = (success)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        result['$<<']("成功レベル:" + (maxnum) + " (" + (setCount) + "セット)");
        if ((($a = (diff['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          diffSuccess = ($rb_ge(maxnum, diff));
          if ((($a = (diffSuccess)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            result['$<<'](" ＞ 成功")
            } else {
            result['$<<'](" ＞ 失敗")
          };};
        } else {
        result['$<<']("失敗")
      };
      return result;
    }, TMP_9.$$arity = 3);

    Opal.defn(self, '$getSuccessInfo', TMP_11 = function $$getSuccessInfo(diceList, crit, diff) {
      var $a, $b, TMP_10, self = this, diceCountHash = nil, maxnum = nil, successDiceList = nil, countThreshold = nil;

      self.$debug("checkSuccess diceList, crit", diceList, crit);
      diceCountHash = self.$getDiceCountHash(diceList, crit);
      self.$debug("diceCountHash", diceCountHash);
      maxnum = 0;
      successDiceList = [];
      countThreshold = ((function() {if ((($a = self.$isDragonDice(crit)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 1
        } else {
        return 2
      }; return nil; })());
      ($a = ($b = diceCountHash).$each, $a.$$p = (TMP_10 = function(dice, count){var self = TMP_10.$$s || this, $c;
if (dice == null) dice = nil;if (count == null) count = nil;
      if ((($c = ($rb_gt(count, maxnum))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          maxnum = count};
        if ((($c = ($rb_ge(count, countThreshold))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return successDiceList['$<<'](dice)
          } else {
          return nil
        };}, TMP_10.$$s = self, TMP_10.$$arity = 2, TMP_10), $a).call($b);
      self.$debug("successDiceList", successDiceList);
      if ((($a = ($rb_le(successDiceList.$size(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [false, 0, 0]};
      if ((($a = (self.$isDragonDice(crit))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        maxnum = $rb_times(maxnum, 2)};
      return [true, maxnum, successDiceList.$size()];
    }, TMP_11.$$arity = 3);

    Opal.defn(self, '$getDiceCountHash', TMP_13 = function $$getDiceCountHash(diceList, crit) {
      var $a, $b, TMP_12, self = this, diceCountHash = nil;

      diceCountHash = ($a = ($b = diceList).$inject, $a.$$p = (TMP_12 = function(hash, dice){var self = TMP_12.$$s || this, $c, $d;
if (hash == null) hash = nil;if (dice == null) dice = nil;
      if ((($c = (((($d = self.$isNomalDice(crit)) !== false && $d !== nil && $d != null) ? $d : (dice['$=='](crit))))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          ($c = dice, $d = hash, $d['$[]=']($c, $rb_plus($d['$[]']($c), 1)))};
        return hash;}, TMP_12.$$s = self, TMP_12.$$arity = 2, TMP_12), $a).call($b, $scope.get('Hash').$new(0));
      return diceCountHash;
    }, TMP_13.$$arity = 2);

    Opal.defn(self, '$isNomalDice', TMP_14 = function $$isNomalDice(crit) {
      var self = this;

      return self.$isDragonDice(crit)['$!']();
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$isDragonDice', TMP_15 = function $$isDragonDice(crit) {
      var self = this;

      return (crit['$!='](0));
    }, TMP_15.$$arity = 1);

    return (Opal.defn(self, '$getValue', TMP_16 = function $$getValue(number) {
      var $a, self = this;

      if ((($a = ($rb_gt(number, 100))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      return number;
    }, TMP_16.$$arity = 1), nil) && 'getValue';
  })($scope.base, $scope.get('DiceBot'))
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);