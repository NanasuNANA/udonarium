/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$setPrefixes', '$=~', '$debug', '$gsub', '$>=', '$<=', '$!=', '$==', '$rating', '$getGratestFortuneFromString', '$getRateUpFromString', '$getCriticalFromString', '$getDiceChangesFromString', '$getKeyAndAddValueFromString', '$to_i', '$getSW2_0_RatingTable', '$-', '$length', '$>', '$getNewRates', '$<', '$+', '$loop', '$rollDice', '$min', '$*', '$[]', '$<<', '$getResultText', '$isSW2_0Mode', '$===', '$parren_killer', '$each', '$split', '$push', '$[]=', '$roll', '$to_s', '$sendMode', '$join', '$getAddText']);
  return (function($base, $super) {
    function $SwordWorld(){};
    var self = $SwordWorld = $klass($base, $super, 'SwordWorld', $SwordWorld);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_10, TMP_11, TMP_12, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27;

    def.rating_table = nil;
    self.$setPrefixes(["K\\d+.*"]);

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, rating_table = nil;

      TMP_1.$$p = null;
      rating_table = 0;
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_1, false)), $a.$$p = null, $a).call($b);
      return self.rating_table = rating_table;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_2 = function $$gameName() {
      var self = this;

      return "ソードワールド";
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$gameType', TMP_3 = function $$gameType() {
      var self = this;

      return "SwordWorld";
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_4 = function $$getHelpMessage() {
      var self = this;

      return "自動的成功、成功、失敗、自動的失敗の自動判定を行います。\n\n・レーティング表　(Kx)\n　\"Kキーナンバー+ボーナス\"の形で記入します。\n　ボーナスの部分に「K20+K30」のようにレーティングを取ることは出来ません。\n　また、ボーナスは複数取ることが出来ます。\n　レーティング表もダイスロールと同様に、他のプレイヤーに隠れてロールすることも可能です。\n　例）K20　　　K10+5　　　k30　　　k10+10　　　Sk10-1　　　k10+5+2\n\n・クリティカル値の設定\n　クリティカル値は\"[クリティカル値]\"で指定します。\n　指定しない場合はクリティカル値10とします。\n　クリティカル処理が必要ないときは13などとしてください。(防御時などの対応)\n　またタイプの軽減化のために末尾に「@クリティカル値」でも処理するようにしました。\n　例）K20[10]　　　K10+5[9]　　　k30[10]　　　k10[9]+10　　　k10-5@9\n";
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_5 = function $$getHelpMessage() {
      var self = this;

      return "・SW　レーティング表　　　　　(Kx[c]+m$f) (x:キー, c:クリティカル値, m:ボーナス, f:出目修正)";
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$changeText', TMP_10 = function $$changeText(string) {
      var $a, $b, TMP_6, $c, TMP_7, $d, TMP_8, $e, TMP_9, self = this;

      if ((($a = (/(^|\s)[sS]?(K[\d]+)/i['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return string
      };
      self.$debug("parren_killer_add before string", string);
      string = ($a = ($b = string).$gsub, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this, $c;

      return "c[" + ((($c = $gvars['~']) === nil ? nil : $c['$[]'](1))) + "]"}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6), $a).call($b, /\[(\d+)\]/i);
      string = ($a = ($c = string).$gsub, $a.$$p = (TMP_7 = function(){var self = TMP_7.$$s || this, $d;

      return "c[" + ((($d = $gvars['~']) === nil ? nil : $d['$[]'](1))) + "]"}, TMP_7.$$s = self, TMP_7.$$arity = 0, TMP_7), $a).call($c, /\@(\d+)/i);
      string = ($a = ($d = string).$gsub, $a.$$p = (TMP_8 = function(){var self = TMP_8.$$s || this, $e;

      return "m[" + ((($e = $gvars['~']) === nil ? nil : $e['$[]'](1))) + "]"}, TMP_8.$$s = self, TMP_8.$$arity = 0, TMP_8), $a).call($d, /\$([\+\-]?[\d]+)/i);
      string = ($a = ($e = string).$gsub, $a.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this, $f;

      return "r[" + ((($f = $gvars['~']) === nil ? nil : $f['$[]'](1))) + "]"}, TMP_9.$$s = self, TMP_9.$$arity = 0, TMP_9), $a).call($e, /r([\+\-]?[\d]+)/i);
      self.$debug("parren_killer_add after string", string);
      return string;
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$check_2D6', TMP_11 = function $$check_2D6(totalValue, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var $a, self = this;

      if ((($a = ($rb_ge(dice_n, 12))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " ＞ 自動的成功"};
      if ((($a = ($rb_le(dice_n, 2))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " ＞ 自動的失敗"};
      if ((($a = (signOfInequality['$!='](">="))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      if ((($a = (diff['$==']("?"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      if ((($a = ($rb_ge(totalValue, diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " ＞ 成功"};
      return " ＞ 失敗";
    }, TMP_11.$$arity = 8);

    Opal.defn(self, '$rollDiceCommand', TMP_12 = function $$rollDiceCommand(command) {
      var self = this;

      return self.$rating(command);
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$rating', TMP_14 = function $$rating(string) {
      var $a, $b, TMP_13, self = this, isGratestFortune = nil, rateUp = nil, crit = nil, firstDiceChanteTo = nil, firstDiceChangeModify = nil, key = nil, addValue = nil, rate_sw2_0 = nil, keyMax = nil, newRates = nil, output = nil, diceResultTotals = nil, diceResults = nil, rateResults = nil, dice = nil, diceOnlyTotal = nil, totalValue = nil, round = nil, limitLength = nil;
      if ($gvars.SEND_STR_MAX == null) $gvars.SEND_STR_MAX = nil;

      self.$debug("rating string", string);
      if ((($a = (/(^|\s)[sS]?(((k|K)[\d\+\-]+)([cmCM]\[([\d\+\-]+)\])*([\d\+\-]*)([cmrCMR]\[([\d\+\-]+)\]|gf|GF)*)($|\s)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("not matched");
        return "1";
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      $b = self.$getGratestFortuneFromString(string), $a = Opal.to_ary($b), isGratestFortune = ($a[0] == null ? nil : $a[0]), string = ($a[1] == null ? nil : $a[1]), $b;
      $b = self.$getRateUpFromString(string), $a = Opal.to_ary($b), rateUp = ($a[0] == null ? nil : $a[0]), string = ($a[1] == null ? nil : $a[1]), $b;
      $b = self.$getCriticalFromString(string), $a = Opal.to_ary($b), crit = ($a[0] == null ? nil : $a[0]), string = ($a[1] == null ? nil : $a[1]), $b;
      $b = self.$getDiceChangesFromString(string), $a = Opal.to_ary($b), firstDiceChanteTo = ($a[0] == null ? nil : $a[0]), firstDiceChangeModify = ($a[1] == null ? nil : $a[1]), string = ($a[2] == null ? nil : $a[2]), $b;
      $b = self.$getKeyAndAddValueFromString(string), $a = Opal.to_ary($b), key = ($a[0] == null ? nil : $a[0]), addValue = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (key['$=~'](/([\d]+)/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return "1"
      };
      key = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
      rate_sw2_0 = self.$getSW2_0_RatingTable();
      keyMax = $rb_minus(rate_sw2_0.$length(), 1);
      self.$debug("keyMax", keyMax);
      if ((($a = ($rb_gt(key, keyMax))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "キーナンバーは" + (keyMax) + "までです"};
      newRates = self.$getNewRates(rate_sw2_0);
      output = "KeyNo." + (key);
      if ((($a = ($rb_lt(crit, 13))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "c[" + (crit) + "]")};
      if ((($a = (firstDiceChangeModify['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "m[" + (firstDiceChangeModify) + "]")};
      if ((($a = (firstDiceChanteTo['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "m[" + (firstDiceChanteTo) + "]")};
      if ((($a = (rateUp['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "r[" + (rateUp) + "]")};
      if ((($a = (isGratestFortune)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "gf")};
      self.$debug("output", output);
      if ((($a = (addValue['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ($rb_gt(addValue, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = $rb_plus(output, "+" + (addValue))};
        if ((($a = ($rb_lt(addValue, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = $rb_plus(output, "" + (addValue))};};
      output = $rb_plus(output, " ＞ ");
      diceResultTotals = [];
      diceResults = [];
      rateResults = [];
      dice = 0;
      diceOnlyTotal = 0;
      totalValue = 0;
      round = 0;
      (function(){var $brk = Opal.new_brk(); try {return ($a = ($b = self).$loop, $a.$$p = (TMP_13 = function(){var self = TMP_13.$$s || this, $c, $d, diceText = nil, currentKey = nil, rateValue = nil;

      $d = self.$rollDice(isGratestFortune), $c = Opal.to_ary($d), dice = ($c[0] == null ? nil : $c[0]), diceText = ($c[1] == null ? nil : $c[1]), $d;
        if ((($c = (firstDiceChanteTo['$!='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice = firstDiceChanteTo;
          firstDiceChanteTo = 0;
        } else if ((($c = (firstDiceChangeModify['$!='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice = $rb_plus(dice, firstDiceChangeModify.$to_i());
          firstDiceChangeModify = 0;};
        if ((($c = ($rb_lt(dice, 2))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice = 2};
        if ((($c = ($rb_gt(dice, 12))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice = 12};
        currentKey = [$rb_plus(key, $rb_times(round, rateUp)), keyMax].$min();
        self.$debug("currentKey", currentKey);
        rateValue = newRates['$[]'](dice)['$[]'](currentKey);
        self.$debug("rateValue", rateValue);
        totalValue = $rb_plus(totalValue, rateValue);
        diceOnlyTotal = $rb_plus(diceOnlyTotal, dice);
        diceResultTotals['$<<']("" + (dice));
        diceResults['$<<']("" + (diceText));
        rateResults['$<<'](((function() {if ((($c = ($rb_gt(dice, 2))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return rateValue
          } else {
          return "**"
        }; return nil; })()));
        round = $rb_plus(round, 1);
        if ((($c = ($rb_lt(dice, crit))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          
          Opal.brk(nil, $brk)
          } else {
          return nil
        };}, TMP_13.$$s = self, TMP_13.$$brk = $brk, TMP_13.$$arity = 0, TMP_13), $a).call($b)
      } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
      limitLength = $rb_minus($gvars.SEND_STR_MAX, output.$length());
      output = $rb_plus(output, self.$getResultText(totalValue, addValue, diceResults, diceResultTotals, rateResults, diceOnlyTotal, round, crit, limitLength));
      return output;
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$getCriticalFromString', TMP_15 = function $$getCriticalFromString(string) {
      var $a, self = this, crit = nil, regexp = nil;

      crit = 10;
      regexp = /c\[(\d+)\]/i;
      if ((($a = (regexp['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        crit = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
        if ((($a = ($rb_lt(crit, 3))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          crit = 3};
        string = string.$gsub(regexp, "");};
      return [crit, string];
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$getDiceChangesFromString', TMP_16 = function $$getDiceChangesFromString(string) {
      var $a, self = this, firstDiceChanteTo = nil, firstDiceChangeModify = nil, regexp = nil;

      firstDiceChanteTo = 0;
      firstDiceChangeModify = 0;
      regexp = /m\[([\d\+\-]+)\]/i;
      if ((($a = (regexp['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        firstDiceChangeModify = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        if ((($a = (/[\+\-]/['$=~'](firstDiceChangeModify))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          firstDiceChanteTo = firstDiceChangeModify.$to_i();
          firstDiceChangeModify = 0;
        };
        string = string.$gsub(regexp, "");};
      return [firstDiceChanteTo, firstDiceChangeModify, string];
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$getRateUpFromString', TMP_17 = function $$getRateUpFromString(string) {
      var $a, self = this, rateUp = nil, regexp = nil;

      rateUp = 0;
      if ((($a = (self.$isSW2_0Mode())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [rateUp, string]
      };
      regexp = /r\[(\d+)\]/i;
      if ((($a = (regexp['$==='](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        rateUp = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
        string = string.$gsub(regexp, "");};
      return [rateUp, string];
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$getGratestFortuneFromString', TMP_18 = function $$getGratestFortuneFromString(string) {
      var $a, self = this, isGratestFortune = nil, regexp = nil;

      isGratestFortune = false;
      if ((($a = (self.$isSW2_0Mode())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [isGratestFortune, string]
      };
      regexp = /gf/i;
      if ((($a = (regexp['$==='](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        isGratestFortune = true;
        string = string.$gsub(regexp, "");};
      return [isGratestFortune, string];
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$isSW2_0Mode', TMP_19 = function $$isSW2_0Mode() {
      var self = this;

      return false;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$getKeyAndAddValueFromString', TMP_20 = function $$getKeyAndAddValueFromString(string) {
      var $a, $b, self = this, key = nil, addValue = nil;

      key = nil;
      addValue = 0;
      if ((($a = (/K(\d+)([\d\+\-]*)/i['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        key = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        if ((($a = ((($b = $gvars['~']) === nil ? nil : $b['$[]'](2)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          addValue = self.$parren_killer($rb_plus($rb_plus("(", (($a = $gvars['~']) === nil ? nil : $a['$[]'](2))), ")")).$to_i()};
        } else {
        key = string
      };
      return [key, addValue];
    }, TMP_20.$$arity = 1);

    Opal.defn(self, '$getSW2_0_RatingTable', TMP_21 = function $$getSW2_0_RatingTable() {
      var self = this, rate_sw2_0 = nil;

      rate_sw2_0 = ["*,0,0,0,1,2,2,3,3,4,4", "*,0,0,0,1,2,3,3,3,4,4", "*,0,0,0,1,2,3,4,4,4,4", "*,0,0,1,1,2,3,4,4,4,5", "*,0,0,1,2,2,3,4,4,5,5", "*,0,1,1,2,2,3,4,5,5,5", "*,0,1,1,2,3,3,4,5,5,5", "*,0,1,1,2,3,4,4,5,5,6", "*,0,1,2,2,3,4,4,5,6,6", "*,0,1,2,3,3,4,4,5,6,7", "*,1,1,2,3,3,4,5,5,6,7", "*,1,2,2,3,3,4,5,6,6,7", "*,1,2,2,3,4,4,5,6,6,7", "*,1,2,3,3,4,4,5,6,7,7", "*,1,2,3,4,4,4,5,6,7,8", "*,1,2,3,4,4,5,5,6,7,8", "*,1,2,3,4,4,5,6,7,7,8", "*,1,2,3,4,5,5,6,7,7,8", "*,1,2,3,4,5,6,6,7,7,8", "*,1,2,3,4,5,6,7,7,8,9", "*,1,2,3,4,5,6,7,8,9,10", "*,1,2,3,4,6,6,7,8,9,10", "*,1,2,3,5,6,6,7,8,9,10", "*,2,2,3,5,6,7,7,8,9,10", "*,2,3,4,5,6,7,7,8,9,10", "*,2,3,4,5,6,7,8,8,9,10", "*,2,3,4,5,6,8,8,9,9,10", "*,2,3,4,6,6,8,8,9,9,10", "*,2,3,4,6,6,8,9,9,10,10", "*,2,3,4,6,7,8,9,9,10,10", "*,2,4,4,6,7,8,9,10,10,10", "*,2,4,5,6,7,8,9,10,10,11", "*,3,4,5,6,7,8,10,10,10,11", "*,3,4,5,6,8,8,10,10,10,11", "*,3,4,5,6,8,9,10,10,11,11", "*,3,4,5,7,8,9,10,10,11,12", "*,3,5,5,7,8,9,10,11,11,12", "*,3,5,6,7,8,9,10,11,12,12", "*,3,5,6,7,8,10,10,11,12,13", "*,4,5,6,7,8,10,11,11,12,13", "*,4,5,6,7,9,10,11,11,12,13", "*,4,6,6,7,9,10,11,12,12,13", "*,4,6,7,7,9,10,11,12,13,13", "*,4,6,7,8,9,10,11,12,13,14", "*,4,6,7,8,10,10,11,12,13,14", "*,4,6,7,9,10,10,11,12,13,14", "*,4,6,7,9,10,10,12,13,13,14", "*,4,6,7,9,10,11,12,13,13,15", "*,4,6,7,9,10,12,12,13,13,15", "*,4,6,7,10,10,12,12,13,14,15", "*,4,6,8,10,10,12,12,13,15,15", "*,5,7,8,10,10,12,12,13,15,15", "*,5,7,8,10,11,12,12,13,15,15", "*,5,7,9,10,11,12,12,14,15,15", "*,5,7,9,10,11,12,13,14,15,16", "*,5,7,10,10,11,12,13,14,16,16", "*,5,8,10,10,11,12,13,15,16,16", "*,5,8,10,11,11,12,13,15,16,17", "*,5,8,10,11,12,12,13,15,16,17", "*,5,9,10,11,12,12,14,15,16,17", "*,5,9,10,11,12,13,14,15,16,18", "*,5,9,10,11,12,13,14,16,17,18", "*,5,9,10,11,13,13,14,16,17,18", "*,5,9,10,11,13,13,15,17,17,18", "*,5,9,10,11,13,14,15,17,17,18", "*,5,9,10,12,13,14,15,17,18,18", "*,5,9,10,12,13,15,15,17,18,19", "*,5,9,10,12,13,15,16,17,19,19", "*,5,9,10,12,14,15,16,17,19,19", "*,5,9,10,12,14,16,16,17,19,19", "*,5,9,10,12,14,16,17,18,19,19", "*,5,9,10,13,14,16,17,18,19,20", "*,5,9,10,13,15,16,17,18,19,20", "*,5,9,10,13,15,16,17,19,20,21", "*,6,9,10,13,15,16,18,19,20,21", "*,6,9,10,13,16,16,18,19,20,21", "*,6,9,10,13,16,17,18,19,20,21", "*,6,9,10,13,16,17,18,20,21,22", "*,6,9,10,13,16,17,19,20,22,23", "*,6,9,10,13,16,18,19,20,22,23", "*,6,9,10,13,16,18,20,21,22,23", "*,6,9,10,13,17,18,20,21,22,23", "*,6,9,10,14,17,18,20,21,22,24", "*,6,9,11,14,17,18,20,21,23,24", "*,6,9,11,14,17,19,20,21,23,24", "*,6,9,11,14,17,19,21,22,23,24", "*,7,10,11,14,17,19,21,22,23,25", "*,7,10,12,14,17,19,21,22,24,25", "*,7,10,12,14,18,19,21,22,24,25", "*,7,10,12,15,18,19,21,22,24,26", "*,7,10,12,15,18,19,21,23,25,26", "*,7,11,13,15,18,19,21,23,25,26", "*,7,11,13,15,18,20,21,23,25,27", "*,8,11,13,15,18,20,22,23,25,27", "*,8,11,13,16,18,20,22,23,25,28", "*,8,11,14,16,18,20,22,23,26,28", "*,8,11,14,16,19,20,22,23,26,28", "*,8,12,14,16,19,20,22,24,26,28", "*,8,12,15,16,19,20,22,24,27,28", "*,8,12,15,17,19,20,22,24,27,29", "*,8,12,15,18,19,20,22,24,27,30"];
      return rate_sw2_0;
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$getNewRates', TMP_23 = function $$getNewRates(rate_sw2_0) {
      var $a, $b, TMP_22, self = this, rate_3 = nil, rate_4 = nil, rate_5 = nil, rate_6 = nil, rate_7 = nil, rate_8 = nil, rate_9 = nil, rate_10 = nil, rate_11 = nil, rate_12 = nil, zeroArray = nil, newRates = nil;

      rate_3 = [];
      rate_4 = [];
      rate_5 = [];
      rate_6 = [];
      rate_7 = [];
      rate_8 = [];
      rate_9 = [];
      rate_10 = [];
      rate_11 = [];
      rate_12 = [];
      zeroArray = [];
      ($a = ($b = rate_sw2_0).$each, $a.$$p = (TMP_22 = function(rateText){var self = TMP_22.$$s || this, rate_arr = nil;
if (rateText == null) rateText = nil;
      rate_arr = rateText.$split(/,/);
        zeroArray.$push(0);
        rate_3.$push(rate_arr['$[]'](1).$to_i());
        rate_4.$push(rate_arr['$[]'](2).$to_i());
        rate_5.$push(rate_arr['$[]'](3).$to_i());
        rate_6.$push(rate_arr['$[]'](4).$to_i());
        rate_7.$push(rate_arr['$[]'](5).$to_i());
        rate_8.$push(rate_arr['$[]'](6).$to_i());
        rate_9.$push(rate_arr['$[]'](7).$to_i());
        rate_10.$push(rate_arr['$[]'](8).$to_i());
        rate_11.$push(rate_arr['$[]'](9).$to_i());
        return rate_12.$push(rate_arr['$[]'](10).$to_i());}, TMP_22.$$s = self, TMP_22.$$arity = 1, TMP_22), $a).call($b);
      if ((($a = (self.rating_table['$=='](1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        rate_12['$[]='](31, rate_12['$[]='](32, rate_12['$[]='](33, 10)))};
      newRates = [zeroArray, zeroArray, zeroArray, rate_3, rate_4, rate_5, rate_6, rate_7, rate_8, rate_9, rate_10, rate_11, rate_12];
      return newRates;
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$rollDice', TMP_24 = function $$rollDice(isGratestFortune) {
      var $a, $b, self = this, dice = nil, diceText = nil;

      if ((($a = (isGratestFortune)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        $b = self.$roll(2, 6), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), diceText = ($a[1] == null ? nil : $a[1]), $b;
        return [dice, diceText];
      };
      $b = self.$roll(1, 6), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), diceText = ($a[1] == null ? nil : $a[1]), $b;
      dice = $rb_times(dice, 2);
      diceText = "" + (diceText) + "," + (diceText);
      return [dice, diceText];
    }, TMP_24.$$arity = 1);

    Opal.defn(self, '$getResultText', TMP_25 = function $$getResultText(totalValue, addValue, diceResults, diceResultTotals, rateResults, diceOnlyTotal, round, crit, limitLength) {
      var $a, self = this, output = nil, totalText = nil, rateResultsText = nil, addText = nil, roundText = nil;

      output = "";
      totalText = ($rb_plus(totalValue, addValue)).$to_s();
      if ((($a = ($rb_gt(self.$sendMode(), 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "2D:[" + (diceResults.$join(" ")) + "]=" + (diceResultTotals.$join(",")));
        rateResultsText = rateResults.$join(",");
        if ((($a = (rateResultsText['$=='](totalText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          output = $rb_plus(output, " ＞ " + (rateResultsText))
        };
      } else if ((($a = ($rb_gt(self.$sendMode(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "2D:" + (diceResultTotals.$join(",")))
        } else {
        output = $rb_plus(output, "" + (totalValue))
      };
      if ((($a = ($rb_le(diceOnlyTotal, 2))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "" + (output) + " ＞ 自動的失敗"};
      addText = self.$getAddText(addValue);
      output = $rb_plus(output, "" + (addText) + " ＞ ");
      roundText = "";
      if ((($a = ($rb_gt(round, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        roundText = $rb_plus(roundText, "" + ($rb_minus(round, 1)) + "回転 ＞ ")};
      output = $rb_plus(output, "" + (roundText) + (totalText));
      if ((($a = ($rb_gt(output.$length(), limitLength))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "... ＞ " + (roundText) + (totalText)};
      return output;
    }, TMP_25.$$arity = 9);

    Opal.defn(self, '$getAddText', TMP_26 = function $$getAddText(addValue) {
      var $a, self = this, addText = nil, operator = nil;

      addText = "";
      if ((($a = (addValue['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return addText};
      operator = ((function() {if ((($a = ($rb_gt(addValue, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "+"
        } else {
        return ""
      }; return nil; })());
      addText = $rb_plus(addText, "" + (operator) + (addValue));
      return addText;
    }, TMP_26.$$arity = 1);

    return (Opal.defn(self, '$setRatingTable', TMP_27 = function $$setRatingTable(tnick) {
      var $a, self = this, mode_str = nil, pre_mode = nil, $case = nil;

      mode_str = "";
      pre_mode = self.rating_table;
      if ((($a = (/(\d+)/['$=~'](tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.rating_table = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
        if ((($a = ($rb_gt(self.rating_table, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          mode_str = "2.0-mode";
          self.rating_table = 2;
        } else if ((($a = ($rb_gt(self.rating_table, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          mode_str = "new-mode";
          self.rating_table = 1;
          } else {
          mode_str = "old-mode";
          self.rating_table = 0;
        };
        } else {
        $case = tnick;if (/old/i['$===']($case)) {self.rating_table = 0;
        mode_str = "old-mode";}else if (/new/i['$===']($case)) {self.rating_table = 1;
        mode_str = "new-mode";}else if (/2\.0/i['$===']($case)) {self.rating_table = 2;
        mode_str = "2.0-mode";}
      };
      if ((($a = (self.rating_table['$=='](pre_mode))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "1"};
      return "RatingTableを" + (mode_str) + "に変更しました";
    }, TMP_27.$$arity = 1), nil) && 'setRatingTable';
  })($scope.base, $scope.get('DiceBot'))
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
Opal.loaded(["diceBot/SwordWorld"]);
/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars, $range = Opal.range;

  Opal.add_stubs(['$require', '$setPrefixes', '$===', '$=~', '$growth', '$to_i', '$get_fumble_table', '$get_tangle_table', '$<=', '$==', '$>=', '$push', '$debug', '$getOriginalMessage', '$join', '$map', '$growth_step', '$roll', '$get_ability_by_dice', '$!=', '$[]', '$-', '$get_table_by_1d6']);
  self.$require("diceBot/SwordWorld");
  return (function($base, $super) {
    function $SwordWorld2_0(){};
    var self = $SwordWorld2_0 = $klass($base, $super, 'SwordWorld2_0', $SwordWorld2_0);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15;

    self.$setPrefixes(["K\\d+.*", "Gr(\\d+)?", "FT", "TT"]);

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, rating_table = nil;

      TMP_1.$$p = null;
      rating_table = 2;
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_1, false)), $a.$$p = null, $a).call($b);
      return self.rating_table = rating_table;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_2 = function $$gameName() {
      var self = this;

      return "ソードワールド2.0";
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$gameType', TMP_3 = function $$gameType() {
      var self = this;

      return "SwordWorld2.0";
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_4 = function $$getHelpMessage() {
      var self = this;

      return "自動的成功、成功、失敗、自動的失敗の自動判定を行います。\n\n・レーティング表　(Kx)\n　\"Kキーナンバー+ボーナス\"の形で記入します。\n　ボーナスの部分に「K20+K30」のようにレーティングを取ることは出来ません。\n　また、ボーナスは複数取ることが出来ます。\n　レーティング表もダイスロールと同様に、他のプレイヤーに隠れてロールすることも可能です。\n　例）K20　　　K10+5　　　k30　　　k10+10　　　Sk10-1　　　k10+5+2\n\n・クリティカル値の設定\n　クリティカル値は\"[クリティカル値]\"で指定します。\n　指定しない場合はクリティカル値10とします。\n　クリティカル処理が必要ないときは13などとしてください。(防御時などの対応)\n　またタイプの軽減化のために末尾に「@クリティカル値」でも処理するようにしました。\n　例）K20[10]　　　K10+5[9]　　　k30[10]　　　k10[9]+10　　　k10-5@9\n\n・ダイス目の修正（運命変転やクリティカルレイ用）\n　末尾に「$修正値」でダイス目に修正がかかります。\n　$＋１と修正表記ならダイス目に＋修正、＄９のように固定値ならダイス目をその出目に差し替え。\n　クリティカルした場合でも固定値や修正値の適用は最初の一回だけです。\n　例）K20$+1　　　K10+5$9　　　k10-5@9$+2　　　k10[9]+10$9\n\n・首切り刀用レーティング上昇 r10\n　例）K20r10　K30+24@8R10　K40+24@8$12r10\n\n・グレイテストフォーチュンは末尾に gf\n　例）K20gf　K30+24@8GF　K40+24@8$12r10gf\n\n・超越判定用に2d6ロールに 2D6@10 書式でクリティカル値付与が可能に。\n　例）2D6@10　2D6@10+11>=30\n\n・成長　(Gr)\n　末尾に数字を付加することで、複数回の成長をまとめて行えます。\n　例）Gr3\n\n・防御ファンブル表　(FT)\n　防御ファンブル表を出すことができます。\n\n・絡み効果表　(TT)\n　絡み効果表を出すことができます。\n";
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$rollDiceCommand', TMP_5 = function $$rollDiceCommand(command) {
      var $a, $b, self = this, $iter = TMP_5.$$p, $yield = $iter || nil, $case = nil;

      TMP_5.$$p = null;
      return (function() {$case = command;if (/^Gr(\d+)?/i['$===']($case)) {if ((($a = command['$=~'](/^Gr(\d+)/i)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$growth((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i())
        } else {
        return self.$growth()
      }}else if ("FT"['$===']($case)) {return self.$get_fumble_table()}else if ("TT"['$===']($case)) {return self.$get_tangle_table()}else {return ($a = ($b = self, Opal.find_super_dispatcher(self, 'rollDiceCommand', TMP_5, false)), $a.$$p = null, $a).call($b, command)}})();
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$isSW2_0Mode', TMP_6 = function $$isSW2_0Mode() {
      var self = this;

      return true;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$is2dCritical', TMP_7 = function $$is2dCritical() {
      var self = this;

      return true;
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$check2dCritical', TMP_8 = function $$check2dCritical(critical, dice_new, dice_arry, loop_count) {
      var $a, self = this;

      if ((($a = ($rb_le(critical, 2))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (loop_count['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (dice_new['$=='](12))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
        if ((($a = (dice_new['$=='](2))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};};
      if ((($a = ($rb_ge(dice_new, critical))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return dice_arry.$push(2)
        } else {
        return nil
      };
    }, TMP_8.$$arity = 4);

    Opal.defn(self, '$check_nD6', TMP_9 = function $$check_nD6(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var $a, $b, self = this, $iter = TMP_9.$$p, $yield = $iter || nil, result = nil, string = nil, superSuccessValue = nil, critical = nil;

      TMP_9.$$p = null;
      self.$debug("check_nD6");
      result = ($a = ($b = self, Opal.find_super_dispatcher(self, 'check_nD6', TMP_9, false)), $a.$$p = null, $a).call($b, total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max);
      if ((($a = (result['$=='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return result
      };
      string = (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$getOriginalMessage();
      superSuccessValue = 41;
      if ((($a = (/@(\d+)/['$==='](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        critical = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
        if ((($a = ($rb_ge(dice_n, critical))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = ($rb_ge(total_n, superSuccessValue))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return " ＞ 超成功"}};};
      return result;
    }, TMP_9.$$arity = 8);

    Opal.defn(self, '$growth', TMP_11 = function $$growth(count) {
      var $a, $b, TMP_10, self = this;

      if (count == null) {
        count = 1;
      }
      return (($a = ($b = ($range(1, count, false))).$map, $a.$$p = (TMP_10 = function(){var self = TMP_10.$$s || this;

      return self.$growth_step()}, TMP_10.$$s = self, TMP_10.$$arity = 0, TMP_10), $a).call($b)).$join(" | ");
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$growth_step', TMP_12 = function $$growth_step() {
      var $a, $b, self = this, d1 = nil, d2 = nil, a1 = nil, a2 = nil;

      $b = self.$roll(1, 6), $a = Opal.to_ary($b), d1 = ($a[0] == null ? nil : $a[0]), $b;
      $b = self.$roll(1, 6), $a = Opal.to_ary($b), d2 = ($a[0] == null ? nil : $a[0]), $b;
      a1 = self.$get_ability_by_dice(d1);
      a2 = self.$get_ability_by_dice(d2);
      return (function() {if ((($a = a1['$!='](a2)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "[" + (d1) + "," + (d2) + "]->(" + (a1) + " or " + (a2) + ")"
        } else {
        return "[" + (d1) + "," + (d2) + "]->(" + (a1) + ")"
      }; return nil; })();
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$get_ability_by_dice', TMP_13 = function $$get_ability_by_dice(dice) {
      var self = this;

      return ["器用度", "敏捷度", "筋力", "生命力", "知力", "精神力"]['$[]']($rb_minus(dice, 1));
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$get_fumble_table', TMP_14 = function $$get_fumble_table() {
      var $a, $b, self = this, table = nil, text = nil, num = nil;

      table = ["この表を2回振り、その両方を適用する。（同じ出目による影響は累積しない）。この自動失敗により得られる経験点は、+50点される", "ダメージに、攻撃者を強化している「剣のかけら」の数が追加される", "ダメージに、攻撃者の「レベル」が追加される", "ダメージ決定を2回行い、より高い方を採用する", "合算ダメージを2倍する", "防護点無効"];
      $b = self.$get_table_by_1d6(table), $a = Opal.to_ary($b), text = ($a[0] == null ? nil : $a[0]), num = ($a[1] == null ? nil : $a[1]), $b;
      return "防御ファンブル表(" + (num) + ") → " + (text);
    }, TMP_14.$$arity = 0);

    return (Opal.defn(self, '$get_tangle_table', TMP_15 = function $$get_tangle_table() {
      var $a, $b, self = this, table = nil, text = nil, num = nil;

      table = ["頭や顔：牙や噛みつきなどにおける命中力判定及び、魔法の行使やブレスに-2のペナルティ修正を受ける", "武器や盾：武器の使用不可、又は盾の回避力修正及び防護点を無効化する", "腕や手：武器や爪などにおける命中力判定に-2のペナルティ修正、盾を持つ腕方の腕ならその盾の回避力修正及び防護点を無効化する", "脚や足：移動不可、更に回避力判定に-2のペナルティ修正を受ける ※両足に絡んでも累積しない", "胴体：生命・精神抵抗力を基準値に用いる判定を除き、あらゆる行為判定に-1のペナルティ修正を受ける", "特殊：尻尾や翼などに命中。絡められた部位を使用する判定において-2のペナルティ修正、またはそこが使えていたことによるボーナス修正を失う ※存在しない場合は決め直し"];
      $b = self.$get_table_by_1d6(table), $a = Opal.to_ary($b), text = ($a[0] == null ? nil : $a[0]), num = ($a[1] == null ? nil : $a[1]), $b;
      return "絡み効果表(" + (num) + ") → " + (text);
    }, TMP_15.$$arity = 0), nil) && 'get_tangle_table';
  })($scope.base, $scope.get('SwordWorld'));
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);