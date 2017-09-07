/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$setPrefixes', '$===', '$getCrashWorldRoll', '$to_i', '$debug', '$!', '$roll', '$==', '$<=', '$+']);
  return (function($base, $super) {
    function $CrashWorld(){};
    var self = $CrashWorld = $klass($base, $super, 'CrashWorld', $CrashWorld);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5;

    self.$setPrefixes(["CW\\d+"]);

    Opal.defn(self, '$gameType', TMP_1 = function $$gameType() {
      var self = this;

      return "CrashWorld";
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_2 = function $$gameName() {
      var self = this;

      return "墜落世界";
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$getHelpMessage', TMP_3 = function $$getHelpMessage() {
      var self = this;

      return "・判定 CWn\n初期目標値n (必須)\n例・CW8\n";
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$rollDiceCommand', TMP_4 = function $$rollDiceCommand(command) {
      var $a, self = this, result = nil, $case = nil;

      result = nil;
      $case = command;if (/CW(\d+)/i['$===']($case)) {result = self.$getCrashWorldRoll((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i())};
      return result;
    }, TMP_4.$$arity = 1);

    return (Opal.defn(self, '$getCrashWorldRoll', TMP_5 = function $$getCrashWorldRoll(target) {
      var $a, $b, $c, self = this, output = nil, isEnd = nil, successness = nil, num = nil;

      self.$debug("target", target);
      output = "(";
      isEnd = false;
      successness = 0;
      num = 0;
      while ((($b = (isEnd['$!']())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      $c = self.$roll(1, 12), $b = Opal.to_ary($c), num = ($b[0] == null ? nil : $b[0]), $c;
      if ((($b = (output['$==']("("))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        output = "(" + (num)
        } else {
        output = "" + (output) + ", " + (num)
      };
      if ((($b = (((($c = $rb_le(num, target)) !== false && $c !== nil && $c != null) ? $c : num['$=='](11)))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        target = num;
        successness = $rb_plus(successness, 1);
      } else if ((($b = (num['$=='](12))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        isEnd = true
        } else {
        isEnd = true
      };};
      if ((($a = (num['$=='](12))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        successness = 0};
      output = "" + (output) + ")  成功度 : " + (successness);
      if ((($a = (num['$=='](12))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (output) + " ファンブル"};
      return output;
    }, TMP_5.$$arity = 1), nil) && 'getCrashWorldRoll';
  })($scope.base, $scope.get('DiceBot'))
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);