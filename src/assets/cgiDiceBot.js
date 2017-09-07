(function(undefined) {
  // @note
  //   A few conventions for the documentation of this file:
  //   1. Always use "//" (in contrast with "/**/")
  //   2. The syntax used is Yardoc (yardoc.org), which is intended for Ruby (se below)
  //   3. `@param` and `@return` types should be preceded by `JS.` when referring to
  //      JavaScript constructors (e.g. `JS.Function`) otherwise Ruby is assumed.
  //   4. `nil` and `null` being unambiguous refer to the respective
  //      objects/values in Ruby and JavaScript
  //   5. This is still WIP :) so please give feedback and suggestions on how
  //      to improve or for alternative solutions
  //
  //   The way the code is digested before going through Yardoc is a secret kept
  //   in the docs repo (https://github.com/opal/docs/tree/master).

  if (typeof(this.Opal) !== 'undefined') {
    console.warn('Opal already loaded. Loading twice can cause troubles, please fix your setup.');
    return this.Opal;
  }

  var nil;

  // The actual class for BasicObject
  var BasicObject;

  // The actual Object class.
  // The leading underscore is to avoid confusion with window.Object()
  var _Object;

  // The actual Module class
  var Module;

  // The actual Class class
  var Class;

  // Constructor for instances of BasicObject
  function BasicObject_alloc(){}

  // Constructor for instances of Object
  function Object_alloc(){}

  // Constructor for instances of Class
  function Class_alloc(){}

  // Constructor for instances of Module
  function Module_alloc(){}

  // Constructor for instances of NilClass (nil)
  function NilClass_alloc(){}

  // The Opal object that is exposed globally
  var Opal = this.Opal = {};

  // All bridged classes - keep track to donate methods from Object
  var bridges = {};

  // TopScope is used for inheriting constants from the top scope
  var TopScope = function(){};

  // Opal just acts as the top scope
  TopScope.prototype = Opal;

  // To inherit scopes
  Opal.constructor = TopScope;

  // List top scope constants
  Opal.constants = [];

  // This is a useful reference to global object inside ruby files
  Opal.global = this;

  // Configure runtime behavior with regards to require and unsupported fearures
  Opal.config = {
    missing_require_severity: 'error', // error, warning, ignore
    unsupported_features_severity: 'warning' // error, warning, ignore
  }

  // Minify common function calls
  var $hasOwn = Opal.hasOwnProperty;
  var $slice  = Opal.slice = Array.prototype.slice;

  // Nil object id is always 4
  var nil_id = 4;

  // Generates even sequential numbers greater than 4
  // (nil_id) to serve as unique ids for ruby objects
  var unique_id = nil_id;

  // Return next unique id
  Opal.uid = function() {
    unique_id += 2;
    return unique_id;
  };

  // Table holds all class variables
  Opal.cvars = {};

  // Globals table
  Opal.gvars = {};

  // Exit function, this should be replaced by platform specific implementation
  // (See nodejs and phantom for examples)
  Opal.exit = function(status) { if (Opal.gvars.DEBUG) console.log('Exited with status '+status); };

  // keeps track of exceptions for $!
  Opal.exceptions = [];

  // @private
  // Pops an exception from the stack and updates `$!`.
  Opal.pop_exception = function() {
    Opal.gvars["!"] = Opal.exceptions.pop() || nil;
  }


  // Constants
  // ---------

  // Get a constant on the given scope. Every class and module in Opal has a
  // scope used to store, and inherit, constants. For example, the top level
  // `Object` in ruby has a scope accessible as `Opal.Object.$$scope`.
  //
  // To get the `Array` class using this scope, you could use:
  //
  //     Opal.Object.$$scope.get("Array")
  //
  // If a constant with the given name cannot be found, then a dispatch to the
  // class/module's `#const_method` is called, which by default will raise an
  // error.
  //
  // @param name [String] the name of the constant to lookup
  // @return [Object]
  //
  Opal.get = function(name) {
    var constant = this[name];

    if (constant == null) {
      return this.base.$const_get(name);
    }

    return constant;
  };

  // Create a new constants scope for the given class with the given
  // base. Constants are looked up through their parents, so the base
  // scope will be the outer scope of the new klass.
  //
  // @param base_scope [$$scope] the scope in which the new scope should be created
  // @param klass      [Class]
  // @param id         [String, null] the name of the newly created scope
  //
  Opal.create_scope = function(base_scope, klass, id) {
    var const_alloc = function() {};
    var const_scope = const_alloc.prototype = new base_scope.constructor();

    klass.$$scope       = const_scope;
    klass.$$base_module = base_scope.base;

    const_scope.base        = klass;
    const_scope.constructor = const_alloc;
    const_scope.constants   = [];

    if (id) {
      Opal.cdecl(base_scope, id, klass);
      const_alloc.displayName = id+"_scope_alloc";
    }
  };

  // Constant assignment, see also `Opal.cdecl`
  //
  // @param base_module [Module, Class] the constant namespace
  // @param name        [String] the name of the constant
  // @param value       [Object] the value of the constant
  //
  // @example Assigning a namespaced constant
  //   self::FOO = 'bar'
  //
  // @example Assigning with Module#const_set
  //   Foo.const_set :BAR, 123
  //
  Opal.casgn = function(base_module, name, value) {
    function update(klass, name) {
      klass.$$name = name;

      for (name in klass.$$scope) {
        var value = klass.$$scope[name];

        if (value.$$name === nil && (value.$$is_class || value.$$is_module)) {
          update(value, name)
        }
      }
    }

    var scope = base_module.$$scope;

    if (value.$$is_class || value.$$is_module) {
      // Only checking _Object prevents setting a const on an anonymous class
      // that has a superclass that's not Object
      if (value.$$is_class || value.$$base_module === _Object) {
        value.$$base_module = base_module;
      }

      if (value.$$name === nil && value.$$base_module.$$name !== nil) {
        update(value, name);
      }
    }

    scope.constants.push(name);
    scope[name] = value;

    // If we dynamically declare a constant in a module,
    // we should populate all the classes that include this module
    // with the same constant
    if (base_module.$$is_module && base_module.$$dep) {
      for (var i = 0; i < base_module.$$dep.length; i++) {
        var dep = base_module.$$dep[i];
        Opal.casgn(dep, name, value);
      }
    }

    return value;
  };

  // Constant declaration
  //
  // @example
  //   FOO = :bar
  //
  // @param base_scope [$$scope] the current scope
  // @param name       [String] the name of the constant
  // @param value      [Object] the value of the constant
  Opal.cdecl = function(base_scope, name, value) {
    if ((value.$$is_class || value.$$is_module) && value.$$orig_scope == null) {
      value.$$name = name;
      value.$$orig_scope = base_scope;
      // Here we should explicitly set a base module
      // (a module where the constant was initially defined)
      value.$$base_module = base_scope.base;
      base_scope.constructor[name] = value;
    }

    base_scope.constants.push(name);
    return base_scope[name] = value;
  };


  // Modules & Classes
  // -----------------

  // A `class Foo; end` expression in ruby is compiled to call this runtime
  // method which either returns an existing class of the given name, or creates
  // a new class in the given `base` scope.
  //
  // If a constant with the given name exists, then we check to make sure that
  // it is a class and also that the superclasses match. If either of these
  // fail, then we raise a `TypeError`. Note, `superclass` may be null if one
  // was not specified in the ruby code.
  //
  // We pass a constructor to this method of the form `function ClassName() {}`
  // simply so that classes show up with nicely formatted names inside debuggers
  // in the web browser (or node/sprockets).
  //
  // The `base` is the current `self` value where the class is being created
  // from. We use this to get the scope for where the class should be created.
  // If `base` is an object (not a class/module), we simple get its class and
  // use that as the base instead.
  //
  // @param base        [Object] where the class is being created
  // @param superclass  [Class,null] superclass of the new class (may be null)
  // @param id          [String] the name of the class to be created
  // @param constructor [JS.Function] function to use as constructor
  //
  // @return new [Class]  or existing ruby class
  //
  Opal.klass = function(base, superclass, name, constructor) {
    var klass, bridged, alloc;

    // If base is an object, use its class
    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    // If the superclass is a function then we're bridging a native JS class
    if (typeof(superclass) === 'function') {
      bridged = superclass;
      superclass = _Object;
    }

    // Try to find the class in the current scope
    klass = base.$$scope[name];

    // If the class exists in the scope, then we must use that
    if (klass && klass.$$orig_scope === base.$$scope) {
      // Make sure the existing constant is a class, or raise error
      if (!klass.$$is_class) {
        throw Opal.TypeError.$new(name + " is not a class");
      }

      // Make sure existing class has same superclass
      if (superclass && klass.$$super !== superclass) {
        throw Opal.TypeError.$new("superclass mismatch for class " + name);
      }

      return klass;
    }

    // Class doesnt exist, create a new one with given superclass...

    // Not specifying a superclass means we can assume it to be Object
    if (superclass == null) {
      superclass = _Object;
    }

    // If bridged the JS class will also be the alloc function
    alloc = bridged || Opal.boot_class_alloc(name, constructor, superclass);

    // Create the class object (instance of Class)
    klass = Opal.setup_class_object(name, alloc, superclass.$$name, superclass.constructor);

    // @property $$super the superclass, doesn't get changed by module inclusions
    klass.$$super = superclass;

    // @property $$parent direct parent class
    //                    starts with the superclass, after klass inclusion is
    //                    the last included klass
    klass.$$parent = superclass;

    // Every class gets its own constant scope, inherited from current scope
    Opal.create_scope(base.$$scope, klass, name);

    // Name new class directly onto current scope (Opal.Foo.Baz = klass)
    base[name] = klass;

    if (bridged) {
      Opal.bridge(klass, alloc);
    }
    else {
      // Copy all parent constants to child, unless parent is Object
      if (superclass !== _Object && superclass !== BasicObject) {
        Opal.donate_constants(superclass, klass);
      }

      // Call .inherited() hook with new class on the superclass
      if (superclass.$inherited) {
        superclass.$inherited(klass);
      }
    }

    return klass;
  };

  // Boot a base class (makes instances).
  //
  // @param name [String,null] the class name
  // @param constructor [JS.Function] the class' instances constructor/alloc function
  // @param superclass  [Class,null] the superclass object
  // @return [JS.Function] the consturctor holding the prototype for the class' instances
  Opal.boot_class_alloc = function(name, constructor, superclass) {
    if (superclass) {
      var alloc_proxy = function() {};
      alloc_proxy.prototype  = superclass.$$proto || superclass.prototype;
      constructor.prototype = new alloc_proxy();
    }

    if (name) {
      constructor.displayName = name+'_alloc';
    }

    constructor.prototype.constructor = constructor;

    return constructor;
  };

  // Adds common/required properties to class object (as in `Class.new`)
  //
  // @param name  [String,null] The name of the class
  //
  // @param alloc [JS.Function] The constructor of the class' instances
  //
  // @param superclass_name [String,null]
  //   The name of the super class, this is
  //   usefule to build the `.displayName` of the singleton class
  //
  // @param superclass_alloc [JS.Function]
  //   The constructor of the superclass from which the singleton_class is
  //   derived.
  //
  // @return [Class]
  Opal.setup_class_object = function(name, alloc, superclass_name, superclass_alloc) {
    // Grab the superclass prototype and use it to build an intermediary object
    // in the prototype chain.
    var superclass_alloc_proxy = function() {};
        superclass_alloc_proxy.prototype = superclass_alloc.prototype;
        superclass_alloc_proxy.displayName = superclass_name;

    var singleton_class_alloc = function() {}
        singleton_class_alloc.prototype = new superclass_alloc_proxy();

    // The built class is the only instance of its singleton_class
    var klass = new singleton_class_alloc();

    // @property $$alloc This is the constructor of instances of the current
    //                   class. Its prototype will be used for method lookup
    klass.$$alloc = alloc;

    klass.$$name = name || nil;

    // @property $$id Each class is assigned a unique `id` that helps
    //                comparation and implementation of `#object_id`
    klass.$$id = Opal.uid();

    // Set a displayName for the singleton_class
    singleton_class_alloc.displayName = "#<Class:"+(name || ("#<Class:"+klass.$$id+">"))+">";

    // @property $$proto This is the prototype on which methods will be defined
    klass.$$proto = alloc.prototype;

    // @property $$proto.$$class Make available to instances a reference to the
    //                           class they belong to.
    klass.$$proto.$$class = klass;

    // @property constructor keeps a ref to the constructor, but apparently the
    //                       constructor is already set on:
    //
    //                          `var klass = new constructor` is called.
    //
    //                       Maybe there are some browsers not abiding (IE6?)
    klass.constructor = singleton_class_alloc;

    // @property $$is_class Clearly mark this as a class
    klass.$$is_class = true;

    // @property $$class Classes are instances of the class Class
    klass.$$class    = Class;

    // @property $$inc included modules
    klass.$$inc = [];

    return klass;
  };

  // Define new module (or return existing module). The given `base` is basically
  // the current `self` value the `module` statement was defined in. If this is
  // a ruby module or class, then it is used, otherwise if the base is a ruby
  // object then that objects real ruby class is used (e.g. if the base is the
  // main object, then the top level `Object` class is used as the base).
  //
  // If a module of the given name is already defined in the base, then that
  // instance is just returned.
  //
  // If there is a class of the given name in the base, then an error is
  // generated instead (cannot have a class and module of same name in same base).
  //
  // Otherwise, a new module is created in the base with the given name, and that
  // new instance is returned back (to be referenced at runtime).
  //
  // @param  base [Module, Class] class or module this definition is inside
  // @param  id   [String] the name of the new (or existing) module
  //
  // @return [Module]
  Opal.module = function(base, name) {
    var module;

    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    if ($hasOwn.call(base.$$scope, name)) {
      module = base.$$scope[name];

      if (!module.$$is_module && module !== _Object) {
        throw Opal.TypeError.$new(name + " is not a module");
      }
    }
    else {
      module = Opal.module_allocate(Module);
      Opal.create_scope(base.$$scope, module, name);
    }

    return module;
  };

  // The implementation for Module#initialize
  // @param module [Module]
  // @param block [Proc,nil]
  // @return nil
  Opal.module_initialize = function(module, block) {
    if (block !== nil) {
      var block_self = block.$$s;
      block.$$s = null;
      block.call(module);
      block.$$s = block_self;
    }
    return nil;
  };

  // Internal function to create a new module instance. This simply sets up
  // the prototype hierarchy and method tables.
  //
  Opal.module_allocate = function(superclass) {
    var mtor = function() {};
    mtor.prototype = superclass.$$alloc.prototype;

    function module_constructor() {}
    module_constructor.prototype = new mtor();

    var module = new module_constructor();
    var module_prototype = {};

    // @property $$id Each class is assigned a unique `id` that helps
    //                comparation and implementation of `#object_id`
    module.$$id = Opal.uid();

    // Set the display name of the singleton prototype holder
    module_constructor.displayName = "#<Class:#<Module:"+module.$$id+">>"

    // @property $$proto This is the prototype on which methods will be defined
    module.$$proto = module_prototype;

    // @property constructor
    //   keeps a ref to the constructor, but apparently the
    //   constructor is already set on:
    //
    //      `var module = new constructor` is called.
    //
    //   Maybe there are some browsers not abiding (IE6?)
    module.constructor = module_constructor;

    // @property $$is_module Clearly mark this as a module
    module.$$is_module = true;
    module.$$class     = Module;

    // @property $$super
    //   the superclass, doesn't get changed by module inclusions
    module.$$super = superclass;

    // @property $$parent
    //   direct parent class or module
    //   starts with the superclass, after module inclusion is
    //   the last included module
    module.$$parent = superclass;

    // @property $$inc included modules
    module.$$inc = [];

    // mark the object as a module
    module.$$is_module = true;

    // initialize dependency tracking
    module.$$dep = [];

    // initialize the name with nil
    module.$$name = nil;

    return module;
  };

  // Return the singleton class for the passed object.
  //
  // If the given object alredy has a singleton class, then it will be stored on
  // the object as the `$$meta` property. If this exists, then it is simply
  // returned back.
  //
  // Otherwise, a new singleton object for the class or object is created, set on
  // the object at `$$meta` for future use, and then returned.
  //
  // @param object [Object] the ruby object
  // @return [Class] the singleton class for object
  Opal.get_singleton_class = function(object) {
    if (object.$$meta) {
      return object.$$meta;
    }

    if (object.$$is_class || object.$$is_module) {
      return Opal.build_class_singleton_class(object);
    }

    return Opal.build_object_singleton_class(object);
  };

  // Build the singleton class for an existing class. Class object are built
  // with their singleton class already in the prototype chain and inheriting
  // from their superclass object (up to `Class` itself).
  //
  // NOTE: Actually in MRI a class' singleton class inherits from its
  // superclass' singleton class which in turn inherits from Class.
  //
  // @param klass [Class]
  // @return [Class]
  Opal.build_class_singleton_class = function(object) {
    var alloc, superclass, klass;

    if (object.$$meta) {
      return object.$$meta;
    }

    // The constructor and prototype of the singleton_class instances is the
    // current class constructor and prototype.
    alloc = object.constructor;

    // The singleton_class superclass is the singleton_class of its superclass;
    // but BasicObject has no superclass (its `$$super` is null), thus we
    // fallback on `Class`.
    superclass = object === BasicObject ? Class : Opal.build_class_singleton_class(object.$$super);

    klass = Opal.setup_class_object(null, alloc, superclass.$$name, superclass.constructor);
    klass.$$super = superclass;
    klass.$$parent = superclass;

    // The singleton_class retains the same scope as the original class
    Opal.create_scope(object.$$scope, klass);

    klass.$$is_singleton = true;
    klass.$$singleton_of = object;

    return object.$$meta = klass;
  };

  // Build the singleton class for a Ruby (non class) Object.
  //
  // @param object [Object]
  // @return [Class]
  Opal.build_object_singleton_class = function(object) {
    var superclass = object.$$class,
        name = "#<Class:#<" + superclass.$$name + ":" + superclass.$$id + ">>";

    var alloc = Opal.boot_class_alloc(name, function(){}, superclass)
    var klass = Opal.setup_class_object(name, alloc, superclass.$$name, superclass.constructor);

    klass.$$super  = superclass;
    klass.$$parent = superclass;
    klass.$$class  = superclass.$$class;
    klass.$$scope  = superclass.$$scope;
    klass.$$proto  = object;

    klass.$$is_singleton = true;
    klass.$$singleton_of = object;

    return object.$$meta = klass;
  };

  // Bridges a single method.
  Opal.bridge_method = function(target, from, name, body) {
    var ancestors, i, ancestor, length;

    ancestors = target.$$bridge.$ancestors();

    // order important here, we have to check for method presence in
    // ancestors from the bridged class to the last ancestor
    for (i = 0, length = ancestors.length; i < length; i++) {
      ancestor = ancestors[i];

      if ($hasOwn.call(ancestor.$$proto, name) &&
          ancestor.$$proto[name] &&
          !ancestor.$$proto[name].$$donated &&
          !ancestor.$$proto[name].$$stub &&
          ancestor !== from) {
        break;
      }

      if (ancestor === from) {
        target.prototype[name] = body
        break;
      }
    }

  };

  // Bridges from *donator* to a *target*.
  Opal._bridge = function(target, donator) {
    var id, methods, method, i, bridged;

    if (typeof(target) === "function") {
      id      = donator.$__id__();
      methods = donator.$instance_methods();

      for (i = methods.length - 1; i >= 0; i--) {
        method = '$' + methods[i];

        Opal.bridge_method(target, donator, method, donator.$$proto[method]);
      }

      if (!bridges[id]) {
        bridges[id] = [];
      }

      bridges[id].push(target);
    }
    else {
      bridged = bridges[target.$__id__()];

      if (bridged) {
        for (i = bridged.length - 1; i >= 0; i--) {
          Opal._bridge(bridged[i], donator);
        }

        bridges[donator.$__id__()] = bridged.slice();
      }
    }
  };

  // The actual inclusion of a module into a class.
  //
  // ## Class `$$parent` and `iclass`
  //
  // To handle `super` calls, every class has a `$$parent`. This parent is
  // used to resolve the next class for a super call. A normal class would
  // have this point to its superclass. However, if a class includes a module
  // then this would need to take into account the module. The module would
  // also have to then point its `$$parent` to the actual superclass. We
  // cannot modify modules like this, because it might be included in more
  // then one class. To fix this, we actually insert an `iclass` as the class'
  // `$$parent` which can then point to the superclass. The `iclass` acts as
  // a proxy to the actual module, so the `super` chain can then search it for
  // the required method.
  //
  // @param module [Module] the module to include
  // @param klass  [Class] the target class to include module into
  // @return [null]
  Opal.append_features = function(module, klass) {
    var iclass, donator, prototype, methods, id, i;

    // check if this module is already included in the class
    for (i = klass.$$inc.length - 1; i >= 0; i--) {
      if (klass.$$inc[i] === module) {
        return;
      }
    }

    klass.$$inc.push(module);
    module.$$dep.push(klass);
    Opal._bridge(klass, module);

    // iclass
    iclass = {
      $$name:   module.$$name,
      $$proto:  module.$$proto,
      $$parent: klass.$$parent,
      $$module: module,
      $$iclass: true
    };

    klass.$$parent = iclass;

    donator   = module.$$proto;
    prototype = klass.$$proto;
    methods   = module.$instance_methods();

    for (i = methods.length - 1; i >= 0; i--) {
      id = '$' + methods[i];

      // if the target class already has a method of the same name defined
      // and that method was NOT donated, then it must be a method defined
      // by the class so we do not want to override it
      if ( prototype.hasOwnProperty(id) &&
          !prototype[id].$$donated &&
          !prototype[id].$$stub) {
        continue;
      }

      prototype[id] = donator[id];
      prototype[id].$$donated = module;
    }

    Opal.donate_constants(module, klass);
  };

  // Table that holds all methods that have been defined on all objects
  // It is used for defining method stubs for new coming native classes
  Opal.stubs = {};

  // For performance, some core Ruby classes are toll-free bridged to their
  // native JavaScript counterparts (e.g. a Ruby Array is a JavaScript Array).
  //
  // This method is used to setup a native constructor (e.g. Array), to have
  // its prototype act like a normal Ruby class. Firstly, a new Ruby class is
  // created using the native constructor so that its prototype is set as the
  // target for th new class. Note: all bridged classes are set to inherit
  // from Object.
  //
  // Example:
  //
  //    Opal.bridge(self, Function);
  //
  // @param klass       [Class] the Ruby class to bridge
  // @param constructor [JS.Function] native JavaScript constructor to use
  // @return [Class] returns the passed Ruby class
  //
  Opal.bridge = function(klass, constructor) {
    if (constructor.$$bridge) {
      throw Opal.ArgumentError.$new("already bridged");
    }

    Opal.stub_subscribers.push(constructor.prototype);

    // Populate constructor with previously stored stubs
    for (var method_name in Opal.stubs) {
      if (!(method_name in constructor.prototype)) {
        constructor.prototype[method_name] = Opal.stub_for(method_name);
      }
    }

    constructor.prototype.$$class = klass;
    constructor.$$bridge          = klass;

    var ancestors = klass.$ancestors();

    // order important here, we have to bridge from the last ancestor to the
    // bridged class
    for (var i = ancestors.length - 1; i >= 0; i--) {
      Opal._bridge(constructor, ancestors[i]);
    }

    for (var name in BasicObject_alloc.prototype) {
      var method = BasicObject_alloc.prototype[method];

      if (method && method.$$stub && !(name in constructor.prototype)) {
        constructor.prototype[name] = method;
      }
    }

    return klass;
  };

  // When a source module is included into the target module, we must also copy
  // its constants to the target.
  //
  Opal.donate_constants = function(source_mod, target_mod) {
    var source_constants = source_mod.$$scope.constants,
        target_scope     = target_mod.$$scope,
        target_constants = target_scope.constants;

    for (var i = 0, length = source_constants.length; i < length; i++) {
      target_constants.push(source_constants[i]);
      target_scope[source_constants[i]] = source_mod.$$scope[source_constants[i]];
    }
  };

  // Donate methods for a module.
  Opal.donate = function(module, jsid) {
    var included_in = module.$$dep,
        body = module.$$proto[jsid],
        i, length, includee, dest, current,
        klass_includees, j, jj, current_owner_index, module_index;

    if (!included_in) {
      return;
    }

    for (i = 0, length = included_in.length; i < length; i++) {
      includee = included_in[i];
      dest = includee.$$proto;
      current = dest[jsid];

      if (dest.hasOwnProperty(jsid) && !current.$$donated && !current.$$stub) {
        // target class has already defined the same method name - do nothing
      }
      else if (dest.hasOwnProperty(jsid) && !current.$$stub) {
        // target class includes another module that has defined this method
        klass_includees = includee.$$inc;

        for (j = 0, jj = klass_includees.length; j < jj; j++) {
          if (klass_includees[j] === current.$$donated) {
            current_owner_index = j;
          }
          if (klass_includees[j] === module) {
            module_index = j;
          }
        }

        // only redefine method on class if the module was included AFTER
        // the module which defined the current method body. Also make sure
        // a module can overwrite a method it defined before
        if (current_owner_index <= module_index) {
          dest[jsid] = body;
          dest[jsid].$$donated = module;
        }
      }
      else {
        // neither a class, or module included by class, has defined method
        dest[jsid] = body;
        dest[jsid].$$donated = module;
      }

      if (includee.$$dep) {
        Opal.donate(includee, jsid);
      }
    }
  };

  // The Array of ancestors for a given module/class
  Opal.ancestors = function(module_or_class) {
    var parent = module_or_class,
        result = [],
        modules;

    while (parent) {
      result.push(parent);
      for (var i=0; i < parent.$$inc.length; i++) {
        modules = Opal.ancestors(parent.$$inc[i]);

        for(var j = 0; j < modules.length; j++) {
          result.push(modules[j]);
        }
      }

      // only the actual singleton class gets included in its ancestry
      // after that, traverse the normal class hierarchy
      if (parent.$$is_singleton && parent.$$singleton_of.$$is_module) {
        parent = parent.$$singleton_of.$$super;
      }
      else {
        parent = parent.$$is_class ? parent.$$super : null;
      }
    }

    return result;
  };


  // Method Missing
  // --------------

  // Methods stubs are used to facilitate method_missing in opal. A stub is a
  // placeholder function which just calls `method_missing` on the receiver.
  // If no method with the given name is actually defined on an object, then it
  // is obvious to say that the stub will be called instead, and then in turn
  // method_missing will be called.
  //
  // When a file in ruby gets compiled to javascript, it includes a call to
  // this function which adds stubs for every method name in the compiled file.
  // It should then be safe to assume that method_missing will work for any
  // method call detected.
  //
  // Method stubs are added to the BasicObject prototype, which every other
  // ruby object inherits, so all objects should handle method missing. A stub
  // is only added if the given property name (method name) is not already
  // defined.
  //
  // Note: all ruby methods have a `$` prefix in javascript, so all stubs will
  // have this prefix as well (to make this method more performant).
  //
  //    Opal.add_stubs(["$foo", "$bar", "$baz="]);
  //
  // All stub functions will have a private `$$stub` property set to true so
  // that other internal methods can detect if a method is just a stub or not.
  // `Kernel#respond_to?` uses this property to detect a methods presence.
  //
  // @param stubs [Array] an array of method stubs to add
  // @return [undefined]
  Opal.add_stubs = function(stubs) {
    var subscriber, subscribers = Opal.stub_subscribers,
        i, ilength = stubs.length,
        j, jlength = subscribers.length,
        method_name, stub;

    for (i = 0; i < ilength; i++) {
      method_name = stubs[i];
      // Save method name to populate other subscribers with this stub
      Opal.stubs[method_name] = true;
      stub = Opal.stub_for(method_name);

      for (j = 0; j < jlength; j++) {
        subscriber = subscribers[j];

        if (!(method_name in subscriber)) {
          subscriber[method_name] = stub;
        }
      }
    }
  };

  // Keep a list of prototypes that want method_missing stubs to be added.
  //
  // @default [Prototype List] BasicObject_alloc.prototype
  //
  Opal.stub_subscribers = [BasicObject_alloc.prototype];

  // Add a method_missing stub function to the given prototype for the
  // given name.
  //
  // @param prototype [Prototype] the target prototype
  // @param stub [String] stub name to add (e.g. "$foo")
  // @return [undefined]
  Opal.add_stub_for = function(prototype, stub) {
    var method_missing_stub = Opal.stub_for(stub);
    prototype[stub] = method_missing_stub;
  };

  // Generate the method_missing stub for a given method name.
  //
  // @param method_name [String] The js-name of the method to stub (e.g. "$foo")
  // @return [undefined]
  Opal.stub_for = function(method_name) {
    function method_missing_stub() {
      // Copy any given block onto the method_missing dispatcher
      this.$method_missing.$$p = method_missing_stub.$$p;

      // Set block property to null ready for the next call (stop false-positives)
      method_missing_stub.$$p = null;

      // call method missing with correct args (remove '$' prefix on method name)
      var args_ary = new Array(arguments.length);
      for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = arguments[i]; }

      return this.$method_missing.apply(this, [method_name.slice(1)].concat(args_ary));
    }

    method_missing_stub.$$stub = true;

    return method_missing_stub;
  };


  // Methods
  // -------

  // Arity count error dispatcher for methods
  //
  // @param actual [Fixnum] number of arguments given to method
  // @param expected [Fixnum] expected number of arguments
  // @param object [Object] owner of the method +meth+
  // @param meth [String] method name that got wrong number of arguments
  // @raise [ArgumentError]
  Opal.ac = function(actual, expected, object, meth) {
    var inspect = '';
    if (object.$$is_class || object.$$is_module) {
      inspect += object.$$name + '.';
    }
    else {
      inspect += object.$$class.$$name + '#';
    }
    inspect += meth;

    throw Opal.ArgumentError.$new('[' + inspect + '] wrong number of arguments(' + actual + ' for ' + expected + ')');
  };

  // Arity count error dispatcher for blocks
  //
  // @param actual [Fixnum] number of arguments given to block
  // @param expected [Fixnum] expected number of arguments
  // @param context [Object] context of the block definition
  // @raise [ArgumentError]
  Opal.block_ac = function(actual, expected, context) {
    var inspect = "`block in " + context + "'";

    throw Opal.ArgumentError.$new(inspect + ': wrong number of arguments (' + actual + ' for ' + expected + ')');
  }

  // Super dispatcher
  Opal.find_super_dispatcher = function(obj, jsid, current_func, defcheck, defs) {
    var dispatcher;

    if (defs) {
      if (obj.$$is_class || obj.$$is_module) {
        dispatcher = defs.$$super;
      }
      else {
        dispatcher = obj.$$class.$$proto;
      }
    }
    else {
      dispatcher = Opal.find_obj_super_dispatcher(obj, jsid, current_func);
    }

    dispatcher = dispatcher['$' + jsid];

    if (!defcheck && dispatcher.$$stub && Opal.Kernel.$method_missing === obj.$method_missing) {
      // method_missing hasn't been explicitly defined
      throw Opal.NoMethodError.$new('super: no superclass method `'+jsid+"' for "+obj, jsid);
    }

    return dispatcher;
  };

  // Iter dispatcher for super in a block
  Opal.find_iter_super_dispatcher = function(obj, jsid, current_func, defcheck, implicit) {
    var call_jsid = jsid;

    if (!current_func) {
      throw Opal.RuntimeError.$new("super called outside of method");
    }

    if (implicit && current_func.$$define_meth) {
      throw Opal.RuntimeError.$new("implicit argument passing of super from method defined by define_method() is not supported. Specify all arguments explicitly");
    }

    if (current_func.$$def) {
      call_jsid = current_func.$$jsid;
    }

    return Opal.find_super_dispatcher(obj, call_jsid, current_func, defcheck);
  };

  Opal.find_obj_super_dispatcher = function(obj, jsid, current_func) {
    var klass = obj.$$meta || obj.$$class;

    // first we need to find the class/module current_func is located on
    klass = Opal.find_owning_class(klass, current_func);

    if (!klass) {
      throw new Error("could not find current class for super()");
    }

    jsid = '$' + jsid;
    return Opal.find_super_func(klass, jsid, current_func);
  };

  Opal.find_owning_class = function(klass, current_func) {
    var owner = current_func.$$owner;

    while (klass) {
      // repeating for readability

      if (klass.$$iclass && klass.$$module === current_func.$$donated) {
        // this klass was the last one the module donated to
        // case is also hit with multiple module includes
        break;
      }
      else if (klass.$$iclass && klass.$$module === owner) {
        // module has donated to other classes but klass isn't one of those
        break;
      }
      else if (owner.$$is_singleton && klass === owner.$$singleton_of.$$class) {
        // cases like stdlib `Singleton::included` that use a singleton of a singleton
        break;
      }
      else if (klass === owner) {
        // no modules, pure class inheritance
        break;
      }

      klass = klass.$$parent;
    }

    return klass;
  };

  Opal.find_super_func = function(owning_klass, jsid, current_func) {
    var klass = owning_klass.$$parent;

    // now we can find the super
    while (klass) {
      var working = klass.$$proto[jsid];

      if (working && working !== current_func) {
        // ok
        break;
      }

      klass = klass.$$parent;
    }

    return klass.$$proto;
  };

  // Used to return as an expression. Sometimes, we can't simply return from
  // a javascript function as if we were a method, as the return is used as
  // an expression, or even inside a block which must "return" to the outer
  // method. This helper simply throws an error which is then caught by the
  // method. This approach is expensive, so it is only used when absolutely
  // needed.
  //
  Opal.ret = function(val) {
    Opal.returner.$v = val;
    throw Opal.returner;
  };

  // Used to break out of a block.
  Opal.brk = function(val, breaker) {
    breaker.$v = val;
    throw breaker;
  };

  // Builds a new unique breaker, this is to avoid multiple nested breaks to get
  // in the way of each other.
  Opal.new_brk = function() {
    return new Error('unexpected break');
  };

  // handles yield calls for 1 yielded arg
  Opal.yield1 = function(block, arg) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    var has_mlhs = block.$$has_top_level_mlhs_arg,
        has_trailing_comma = block.$$has_trailing_comma_in_args;

    if (block.length > 1 || ((has_mlhs || has_trailing_comma) && block.length === 1)) {
      arg = Opal.to_ary(arg);
    }

    if ((block.length > 1 || (has_trailing_comma && block.length === 1)) && arg.$$is_array) {
      return block.apply(null, arg);
    }
    else {
      return block(arg);
    }
  };

  // handles yield for > 1 yielded arg
  Opal.yieldX = function(block, args) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1 && args.length === 1) {
      if (args[0].$$is_array) {
        return block.apply(null, args[0]);
      }
    }

    if (!args.$$is_array) {
      var args_ary = new Array(args.length);
      for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = args[i]; }

      return block.apply(null, args_ary);
    }

    return block.apply(null, args);
  };

  // Finds the corresponding exception match in candidates.  Each candidate can
  // be a value, or an array of values.  Returns null if not found.
  Opal.rescue = function(exception, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];

      if (candidate.$$is_array) {
        var result = Opal.rescue(exception, candidate);

        if (result) {
          return result;
        }
      }
      else if (candidate['$==='](exception)) {
        return candidate;
      }
    }

    return null;
  };

  Opal.is_a = function(object, klass) {
    if (object.$$meta === klass) {
      return true;
    }

    var i, length, ancestors = Opal.ancestors(object.$$class);

    for (i = 0, length = ancestors.length; i < length; i++) {
      if (ancestors[i] === klass) {
        return true;
      }
    }

    ancestors = Opal.ancestors(object.$$meta);

    for (i = 0, length = ancestors.length; i < length; i++) {
      if (ancestors[i] === klass) {
        return true;
      }
    }

    return false;
  };

  // Helpers for extracting kwsplats
  // Used for: { **h }
  Opal.to_hash = function(value) {
    if (value.$$is_hash) {
      return value;
    }
    else if (value['$respond_to?']('to_hash', true)) {
      var hash = value.$to_hash();
      if (hash.$$is_hash) {
        return hash;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Hash (" + value.$$class + "#to_hash gives " + hash.$$class + ")");
      }
    }
    else {
      throw Opal.TypeError.$new("no implicit conversion of " + value.$$class + " into Hash");
    }
  };

  // Helpers for implementing multiple assignment
  // Our code for extracting the values and assigning them only works if the
  // return value is a JS array.
  // So if we get an Array subclass, extract the wrapped JS array from it

  // Used for: a, b = something (no splat)
  Opal.to_ary = function(value) {
    if (value.$$is_array) {
      return value;
    }
    else if (value['$respond_to?']('to_ary', true)) {
      var ary = value.$to_ary();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return ary;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_ary gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  // Used for: a, b = *something (with splat)
  Opal.to_a = function(value) {
    if (value.$$is_array) {
      // A splatted array must be copied
      return value.slice();
    }
    else if (value['$respond_to?']('to_a', true)) {
      var ary = value.$to_a();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return ary;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_a gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  // Used for extracting keyword arguments from arguments passed to
  // JS function. If provided +arguments+ list doesn't have a Hash
  // as a last item, returns a blank Hash.
  //
  // @param parameters [Array]
  // @return [Hash]
  //
  Opal.extract_kwargs = function(parameters) {
    var kwargs = parameters[parameters.length - 1];
    if (kwargs != null && kwargs['$respond_to?']('to_hash', true)) {
      Array.prototype.splice.call(parameters, parameters.length - 1, 1);
      return kwargs.$to_hash();
    }
    else {
      return Opal.hash2([], {});
    }
  }

  // Used to get a list of rest keyword arguments. Method takes the given
  // keyword args, i.e. the hash literal passed to the method containing all
  // keyword arguemnts passed to method, as well as the used args which are
  // the names of required and optional arguments defined. This method then
  // just returns all key/value pairs which have not been used, in a new
  // hash literal.
  //
  // @param given_args [Hash] all kwargs given to method
  // @param used_args [Object<String: true>] all keys used as named kwargs
  // @return [Hash]
  //
  Opal.kwrestargs = function(given_args, used_args) {
    var keys      = [],
        map       = {},
        key       = null,
        given_map = given_args.$$smap;

    for (key in given_map) {
      if (!used_args[key]) {
        keys.push(key);
        map[key] = given_map[key];
      }
    }

    return Opal.hash2(keys, map);
  };

  // Call a ruby method on a ruby object with some arguments:
  //
  // @example
  //   var my_array = [1, 2, 3, 4]
  //   Opal.send(my_array, 'length')     # => 4
  //   Opal.send(my_array, 'reverse!')   # => [4, 3, 2, 1]
  //
  // A missing method will be forwarded to the object via
  // method_missing.
  //
  // The result of either call with be returned.
  //
  // @param recv [Object] the ruby object
  // @param mid  [String] ruby method to call
  // @return [Object] forwards the return value of the method (or of method_missing)
  Opal.send = function(recv, mid) {
    var args_ary = new Array(Math.max(arguments.length - 2, 0));
    for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = arguments[i + 2]; }

    var func = recv['$' + mid];

    if (func) {
      return func.apply(recv, args_ary);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args_ary));
  };

  Opal.block_send = function(recv, mid, block) {
    var args_ary = new Array(Math.max(arguments.length - 3, 0));
    for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = arguments[i + 3]; }

    var func = recv['$' + mid];

    if (func) {
      func.$$p = block;
      return func.apply(recv, args_ary);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args_ary));
  };

  // Used to define methods on an object. This is a helper method, used by the
  // compiled source to define methods on special case objects when the compiler
  // can not determine the destination object, or the object is a Module
  // instance. This can get called by `Module#define_method` as well.
  //
  // ## Modules
  //
  // Any method defined on a module will come through this runtime helper.
  // The method is added to the module body, and the owner of the method is
  // set to be the module itself. This is used later when choosing which
  // method should show on a class if more than 1 included modules define
  // the same method. Finally, if the module is in `module_function` mode,
  // then the method is also defined onto the module itself.
  //
  // ## Classes
  //
  // This helper will only be called for classes when a method is being
  // defined indirectly; either through `Module#define_method`, or by a
  // literal `def` method inside an `instance_eval` or `class_eval` body. In
  // either case, the method is simply added to the class' prototype. A special
  // exception exists for `BasicObject` and `Object`. These two classes are
  // special because they are used in toll-free bridged classes. In each of
  // these two cases, extra work is required to define the methods on toll-free
  // bridged class' prototypes as well.
  //
  // ## Objects
  //
  // If a simple ruby object is the object, then the method is simply just
  // defined on the object as a singleton method. This would be the case when
  // a method is defined inside an `instance_eval` block.
  //
  // @param obj  [Object, Class] the actual obj to define method for
  // @param jsid [String] the JavaScript friendly method name (e.g. '$foo')
  // @param body [JS.Function] the literal JavaScript function used as method
  // @return [null]
  //
  Opal.defn = function(obj, jsid, body) {
    obj.$$proto[jsid] = body;
    // for super dispatcher, etc.
    body.$$owner = obj;

    if (obj.$$is_module) {
      Opal.donate(obj, jsid);

      if (obj.$$module_function) {
        Opal.defs(obj, jsid, body);
      }
    }

    if (obj.$__id__ && !obj.$__id__.$$stub) {
      var bridged = bridges[obj.$__id__()];

      if (bridged) {
        for (var i = bridged.length - 1; i >= 0; i--) {
          Opal.bridge_method(bridged[i], obj, jsid, body);
        }
      }
    }

    var singleton_of = obj.$$singleton_of;
    if (obj.$method_added && !obj.$method_added.$$stub && !singleton_of) {
      obj.$method_added(jsid.substr(1));
    }
    else if (singleton_of && singleton_of.$singleton_method_added && !singleton_of.$singleton_method_added.$$stub) {
      singleton_of.$singleton_method_added(jsid.substr(1));
    }

    return nil;
  };

  // Define a singleton method on the given object.
  Opal.defs = function(obj, jsid, body) {
    Opal.defn(Opal.get_singleton_class(obj), jsid, body)
  };

  Opal.def = function(obj, jsid, body) {
    // if instance_eval is invoked on a module/class, it sets inst_eval_mod
    if (!obj.$$eval && (obj.$$is_class || obj.$$is_module)) {
      Opal.defn(obj, jsid, body);
    }
    else {
      Opal.defs(obj, jsid, body);
    }
  };

  // Called from #remove_method.
  Opal.rdef = function(obj, jsid) {
    // TODO: remove from bridges as well

    if (!$hasOwn.call(obj.$$proto, jsid)) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    delete obj.$$proto[jsid];

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_removed && !obj.$$proto.$singleton_method_removed.$$stub) {
        obj.$$proto.$singleton_method_removed(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_removed && !obj.$method_removed.$$stub) {
        obj.$method_removed(jsid.substr(1));
      }
    }
  };

  // Called from #undef_method.
  Opal.udef = function(obj, jsid) {
    if (!obj.$$proto[jsid] || obj.$$proto[jsid].$$stub) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    Opal.add_stub_for(obj.$$proto, jsid);

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_undefined && !obj.$$proto.$singleton_method_undefined.$$stub) {
        obj.$$proto.$singleton_method_undefined(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_undefined && !obj.$method_undefined.$$stub) {
        obj.$method_undefined(jsid.substr(1));
      }
    }
  };

  Opal.alias = function(obj, name, old) {
    var id     = '$' + name,
        old_id = '$' + old,
        body   = obj.$$proto['$' + old];

    // instance_eval is being run on a class/module, so that need to alias class methods
    if (obj.$$eval) {
      return Opal.alias(Opal.get_singleton_class(obj), name, old);
    }

    if (typeof(body) !== "function" || body.$$stub) {
      var ancestor = obj.$$super;

      while (typeof(body) !== "function" && ancestor) {
        body     = ancestor[old_id];
        ancestor = ancestor.$$super;
      }

      if (typeof(body) !== "function" || body.$$stub) {
        throw Opal.NameError.$new("undefined method `" + old + "' for class `" + obj.$name() + "'")
      }
    }

    Opal.defn(obj, id, body);

    return obj;
  };

  Opal.alias_native = function(obj, name, native_name) {
    var id   = '$' + name,
        body = obj.$$proto[native_name];

    if (typeof(body) !== "function" || body.$$stub) {
      throw Opal.NameError.$new("undefined native method `" + native_name + "' for class `" + obj.$name() + "'")
    }

    Opal.defn(obj, id, body);

    return obj;
  };


  // Hashes
  // ------

  Opal.hash_init = function(hash) {
    hash.$$smap = {};
    hash.$$map  = {};
    hash.$$keys = [];
  };

  Opal.hash_clone = function(from_hash, to_hash) {
    to_hash.$$none = from_hash.$$none;
    to_hash.$$proc = from_hash.$$proc;

    for (var i = 0, keys = from_hash.$$keys, length = keys.length, key, value; i < length; i++) {
      key = from_hash.$$keys[i];

      if (key.$$is_string) {
        value = from_hash.$$smap[key];
      } else {
        value = key.value;
        key = key.key;
      }

      Opal.hash_put(to_hash, key, value);
    }
  };

  Opal.hash_put = function(hash, key, value) {
    if (key.$$is_string) {
      if (!hash.$$smap.hasOwnProperty(key)) {
        hash.$$keys.push(key);
      }
      hash.$$smap[key] = value;
      return;
    }

    var key_hash = key.$hash(), bucket, last_bucket;

    if (!hash.$$map.hasOwnProperty(key_hash)) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      hash.$$map[key_hash] = bucket;
      return;
    }

    bucket = hash.$$map[key_hash];

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        last_bucket = undefined;
        bucket.value = value;
        break;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }

    if (last_bucket) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      last_bucket.next = bucket;
    }
  };

  Opal.hash_get = function(hash, key) {
    if (key.$$is_string) {
      if (hash.$$smap.hasOwnProperty(key)) {
        return hash.$$smap[key];
      }
      return;
    }

    var key_hash = key.$hash(), bucket;

    if (hash.$$map.hasOwnProperty(key_hash)) {
      bucket = hash.$$map[key_hash];

      while (bucket) {
        if (key === bucket.key || key['$eql?'](bucket.key)) {
          return bucket.value;
        }
        bucket = bucket.next;
      }
    }
  };

  Opal.hash_delete = function(hash, key) {
    var i, keys = hash.$$keys, length = keys.length, value;

    if (key.$$is_string) {
      if (!hash.$$smap.hasOwnProperty(key)) {
        return;
      }

      for (i = 0; i < length; i++) {
        if (keys[i] === key) {
          keys.splice(i, 1);
          break;
        }
      }

      value = hash.$$smap[key];
      delete hash.$$smap[key];
      return value;
    }

    var key_hash = key.$hash();

    if (!hash.$$map.hasOwnProperty(key_hash)) {
      return;
    }

    var bucket = hash.$$map[key_hash], last_bucket;

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        value = bucket.value;

        for (i = 0; i < length; i++) {
          if (keys[i] === bucket) {
            keys.splice(i, 1);
            break;
          }
        }

        if (last_bucket && bucket.next) {
          last_bucket.next = bucket.next;
        }
        else if (last_bucket) {
          delete last_bucket.next;
        }
        else if (bucket.next) {
          hash.$$map[key_hash] = bucket.next;
        }
        else {
          delete hash.$$map[key_hash];
        }

        return value;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }
  };

  Opal.hash_rehash = function(hash) {
    for (var i = 0, length = hash.$$keys.length, key_hash, bucket, last_bucket; i < length; i++) {

      if (hash.$$keys[i].$$is_string) {
        continue;
      }

      key_hash = hash.$$keys[i].key.$hash();

      if (key_hash === hash.$$keys[i].key_hash) {
        continue;
      }

      bucket = hash.$$map[hash.$$keys[i].key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          if (last_bucket && bucket.next) {
            last_bucket.next = bucket.next;
          }
          else if (last_bucket) {
            delete last_bucket.next;
          }
          else if (bucket.next) {
            hash.$$map[hash.$$keys[i].key_hash] = bucket.next;
          }
          else {
            delete hash.$$map[hash.$$keys[i].key_hash];
          }
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      hash.$$keys[i].key_hash = key_hash;

      if (!hash.$$map.hasOwnProperty(key_hash)) {
        hash.$$map[key_hash] = hash.$$keys[i];
        continue;
      }

      bucket = hash.$$map[key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          last_bucket = undefined;
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      if (last_bucket) {
        last_bucket.next = hash.$$keys[i];
      }
    }
  };

  Opal.hash = function() {
    var arguments_length = arguments.length, args, hash, i, length, key, value;

    if (arguments_length === 1 && arguments[0].$$is_hash) {
      return arguments[0];
    }

    hash = new Opal.Hash.$$alloc();
    Opal.hash_init(hash);

    if (arguments_length === 1 && arguments[0].$$is_array) {
      args = arguments[0];
      length = args.length;

      for (i = 0; i < length; i++) {
        if (args[i].length !== 2) {
          throw Opal.ArgumentError.$new("value not of length 2: " + args[i].$inspect());
        }

        key = args[i][0];
        value = args[i][1];

        Opal.hash_put(hash, key, value);
      }

      return hash;
    }

    if (arguments_length === 1) {
      args = arguments[0];
      for (key in args) {
        if (args.hasOwnProperty(key)) {
          value = args[key];

          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    }

    if (arguments_length % 2 !== 0) {
      throw Opal.ArgumentError.$new("odd number of arguments for Hash");
    }

    for (i = 0; i < arguments_length; i += 2) {
      key = arguments[i];
      value = arguments[i + 1];

      Opal.hash_put(hash, key, value);
    }

    return hash;
  };

  // hash2 is a faster creator for hashes that just use symbols and
  // strings as keys. The map and keys array can be constructed at
  // compile time, so they are just added here by the constructor
  // function
  //
  Opal.hash2 = function(keys, smap) {
    var hash = new Opal.Hash.$$alloc();

    hash.$$smap = smap;
    hash.$$map  = {};
    hash.$$keys = keys;

    return hash;
  };

  // Create a new range instance with first and last values, and whether the
  // range excludes the last value.
  //
  Opal.range = function(first, last, exc) {
    var range         = new Opal.Range.$$alloc();
        range.begin   = first;
        range.end     = last;
        range.exclude = exc;

    return range;
  };

  Opal.ivar = function(name) {
    if (
        // properties
        name === "constructor" ||
        name === "displayName" ||
        name === "__count__" ||
        name === "__noSuchMethod__" ||
        name === "__parent__" ||
        name === "__proto__" ||

        // methods
        name === "hasOwnProperty" ||
        name === "valueOf"
       )
    {
      return name + "$";
    }

    return name;
  };


  // Require system
  // --------------

  Opal.modules         = {};
  Opal.loaded_features = ['corelib/runtime'];
  Opal.current_dir     = '.'
  Opal.require_table   = {'corelib/runtime': true};

  Opal.normalize = function(path) {
    var parts, part, new_parts = [], SEPARATOR = '/';

    if (Opal.current_dir !== '.') {
      path = Opal.current_dir.replace(/\/*$/, '/') + path;
    }

    path = path.replace(/\.(rb|opal|js)$/, '');
    parts = path.split(SEPARATOR);

    for (var i = 0, ii = parts.length; i < ii; i++) {
      part = parts[i];
      if (part === '') continue;
      (part === '..') ? new_parts.pop() : new_parts.push(part)
    }

    return new_parts.join(SEPARATOR);
  };

  Opal.loaded = function(paths) {
    var i, l, path;

    for (i = 0, l = paths.length; i < l; i++) {
      path = Opal.normalize(paths[i]);

      if (Opal.require_table[path]) {
        return;
      }

      Opal.loaded_features.push(path);
      Opal.require_table[path] = true;
    }
  };

  Opal.load = function(path) {
    path = Opal.normalize(path);

    Opal.loaded([path]);

    var module = Opal.modules[path];

    if (module) {
      module(Opal);
    }
    else {
      var severity = Opal.config.missing_require_severity;
      var message  = 'cannot load such file -- ' + path;

      if (severity === "error") {
        Opal.LoadError ? Opal.LoadError.$new(message) : function(){throw message}();
      }
      else if (severity === "warning") {
        console.warn('WARNING: LoadError: ' + message);
      }
    }

    return true;
  };

  Opal.require = function(path) {
    path = Opal.normalize(path);

    if (Opal.require_table[path]) {
      return false;
    }

    return Opal.load(path);
  };


  // Initialization
  // --------------

  // Constructors for *instances* of core objects
  Opal.boot_class_alloc('BasicObject', BasicObject_alloc);
  Opal.boot_class_alloc('Object',      Object_alloc,       BasicObject_alloc);
  Opal.boot_class_alloc('Module',      Module_alloc,       Object_alloc);
  Opal.boot_class_alloc('Class',       Class_alloc,        Module_alloc);

  // Constructors for *classes* of core objects
  Opal.BasicObject = BasicObject = Opal.setup_class_object('BasicObject', BasicObject_alloc, 'Class',       Class_alloc);
  Opal.Object      = _Object     = Opal.setup_class_object('Object',      Object_alloc,      'BasicObject', BasicObject.constructor);
  Opal.Module      = Module      = Opal.setup_class_object('Module',      Module_alloc,      'Object',      _Object.constructor);
  Opal.Class       = Class       = Opal.setup_class_object('Class',       Class_alloc,       'Module',      Module.constructor);

  Opal.constants.push("BasicObject");
  Opal.constants.push("Object");
  Opal.constants.push("Module");
  Opal.constants.push("Class");

  // Fix booted classes to use their metaclass
  BasicObject.$$class = Class;
  _Object.$$class     = Class;
  Module.$$class      = Class;
  Class.$$class       = Class;

  // Fix superclasses of booted classes
  BasicObject.$$super = null;
  _Object.$$super     = BasicObject;
  Module.$$super      = _Object;
  Class.$$super       = Module;

  BasicObject.$$parent = null;
  _Object.$$parent     = BasicObject;
  Module.$$parent      = _Object;
  Class.$$parent       = Module;

  Opal.base                = _Object;
  BasicObject.$$scope      = _Object.$$scope = Opal;
  BasicObject.$$orig_scope = _Object.$$orig_scope = Opal;

  Module.$$scope      = _Object.$$scope;
  Module.$$orig_scope = _Object.$$orig_scope;
  Class.$$scope       = _Object.$$scope;
  Class.$$orig_scope  = _Object.$$orig_scope;

  // Forward .toString() to #to_s
  _Object.$$proto.toString = function() {
    return this.$to_s();
  };

  // Make Kernel#require immediately available as it's needed to require all the
  // other corelib files.
  _Object.$$proto.$require = Opal.require;

  // Instantiate the top object
  Opal.top = new _Object.$$alloc();

  // Nil
  Opal.klass(_Object, _Object, 'NilClass', NilClass_alloc);
  nil = Opal.nil = new NilClass_alloc();
  nil.$$id = nil_id;
  nil.call = nil.apply = function() { throw Opal.LocalJumpError.$new('no block given'); };
  Opal.breaker  = new Error('unexpected break (old)');
  Opal.returner = new Error('unexpected return');

  TypeError.$$super = Error;
}).call(this);

if (typeof(global) !== 'undefined') {
  global.Opal = this.Opal;
  Opal.global = global;
}

if (typeof(window) !== 'undefined') {
  window.Opal = this.Opal;
  Opal.global = window;
}
Opal.loaded(["corelib/runtime"]);
/* Generated by Opal 0.10.5 */
Opal.modules["corelib/helpers"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$class', '$===', '$respond_to?', '$raise', '$type_error', '$__send__', '$coerce_to', '$nil?', '$<=>', '$inspect', '$coerce_to!', '$!=', '$[]', '$upcase']);
  return (function($base) {
    var $Opal, self = $Opal = $module($base, 'Opal');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13;

    Opal.defs(self, '$bridge', TMP_1 = function $$bridge(klass, constructor) {
      var self = this;

      return Opal.bridge(klass, constructor);
    }, TMP_1.$$arity = 2);

    Opal.defs(self, '$type_error', TMP_2 = function $$type_error(object, type, method, coerced) {
      var $a, $b, self = this;

      if (method == null) {
        method = nil;
      }
      if (coerced == null) {
        coerced = nil;
      }
      if ((($a = (($b = method !== false && method !== nil && method != null) ? coerced : method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('TypeError').$new("can't convert " + (object.$class()) + " into " + (type) + " (" + (object.$class()) + "#" + (method) + " gives " + (coerced.$class()))
        } else {
        return $scope.get('TypeError').$new("no implicit conversion of " + (object.$class()) + " into " + (type))
      };
    }, TMP_2.$$arity = -3);

    Opal.defs(self, '$coerce_to', TMP_3 = function $$coerce_to(object, type, method) {
      var $a, self = this;

      if ((($a = type['$==='](object)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type))
      };
      return object.$__send__(method);
    }, TMP_3.$$arity = 3);

    Opal.defs(self, '$coerce_to!', TMP_4 = function(object, type, method) {
      var $a, self = this, coerced = nil;

      coerced = self.$coerce_to(object, type, method);
      if ((($a = type['$==='](coerced)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    }, TMP_4.$$arity = 3);

    Opal.defs(self, '$coerce_to?', TMP_5 = function(object, type, method) {
      var $a, self = this, coerced = nil;

      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      coerced = self.$coerce_to(object, type, method);
      if ((($a = coerced['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = type['$==='](coerced)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    }, TMP_5.$$arity = 3);

    Opal.defs(self, '$try_convert', TMP_6 = function $$try_convert(object, type, method) {
      var $a, self = this;

      if ((($a = type['$==='](object)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object.$__send__(method)
        } else {
        return nil
      };
    }, TMP_6.$$arity = 3);

    Opal.defs(self, '$compare', TMP_7 = function $$compare(a, b) {
      var $a, self = this, compare = nil;

      compare = a['$<=>'](b);
      if ((($a = compare === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (a.$class()) + " with " + (b.$class()) + " failed")};
      return compare;
    }, TMP_7.$$arity = 2);

    Opal.defs(self, '$destructure', TMP_8 = function $$destructure(args) {
      var self = this;

      
      if (args.length == 1) {
        return args[0];
      }
      else if (args.$$is_array) {
        return args;
      }
      else {
        var args_ary = new Array(args.length);
        for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = args[i]; }

        return args_ary;
      }
    
    }, TMP_8.$$arity = 1);

    Opal.defs(self, '$respond_to?', TMP_9 = function(obj, method) {
      var self = this;

      
      if (obj == null || !obj.$$class) {
        return false;
      }
    
      return obj['$respond_to?'](method);
    }, TMP_9.$$arity = 2);

    Opal.defs(self, '$inspect', TMP_10 = function $$inspect(obj) {
      var self = this;

      
      if (obj === undefined) {
        return "undefined";
      }
      else if (obj === null) {
        return "null";
      }
      else if (!obj.$$class) {
        return obj.toString();
      }
      else {
        return obj.$inspect();
      }
    
    }, TMP_10.$$arity = 1);

    Opal.defs(self, '$instance_variable_name!', TMP_11 = function(name) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = /^@[a-zA-Z_][a-zA-Z0-9_]*?$/.test(name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("'" + (name) + "' is not allowed as an instance variable name", name))
      };
      return name;
    }, TMP_11.$$arity = 1);

    Opal.defs(self, '$const_name!', TMP_12 = function(const_name) {
      var $a, self = this;

      const_name = $scope.get('Opal')['$coerce_to!'](const_name, $scope.get('String'), "to_str");
      if ((($a = const_name['$[]'](0)['$!='](const_name['$[]'](0).$upcase())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError'), "wrong constant name " + (const_name))};
      return const_name;
    }, TMP_12.$$arity = 1);

    Opal.defs(self, '$pristine', TMP_13 = function $$pristine(owner_class, $a_rest) {
      var self = this, method_names;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      method_names = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        method_names[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      var method_name;
      for (var i = method_names.length - 1; i >= 0; i--) {
        method_name = method_names[i];
        owner_class.$$proto['$'+method_name].$$pristine = true
      }
    
      return nil;
    }, TMP_13.$$arity = -2);
  })($scope.base)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/module"] = function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range, $hash2 = Opal.hash2;

  Opal.add_stubs(['$===', '$raise', '$equal?', '$<', '$>', '$nil?', '$attr_reader', '$attr_writer', '$coerce_to!', '$new', '$const_name!', '$=~', '$inject', '$const_get', '$split', '$const_missing', '$==', '$!', '$start_with?', '$to_proc', '$lambda', '$bind', '$call', '$class', '$append_features', '$included', '$name', '$cover?', '$size', '$merge', '$compile', '$proc', '$to_s', '$__id__', '$constants', '$include?']);
  return (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_22, TMP_23, TMP_24, TMP_25, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_41, TMP_42, TMP_43, TMP_44, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49;

    Opal.defs(self, '$allocate', TMP_1 = function $$allocate() {
      var self = this;

      
      var module;

      module = Opal.module_allocate(self);
      Opal.create_scope(Opal.Module.$$scope, module, null);
      return module;
    
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$initialize', TMP_2 = function $$initialize() {
      var self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      return Opal.module_initialize(self, block);
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$===', TMP_3 = function(object) {
      var $a, self = this;

      if ((($a = object == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return false};
      return Opal.is_a(object, self);
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$<', TMP_4 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Module')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "compared with non class/module")
      };
      
      var working = self,
          ancestors,
          i, length;

      if (working === other) {
        return false;
      }

      for (i = 0, ancestors = Opal.ancestors(self), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === other) {
          return true;
        }
      }

      for (i = 0, ancestors = Opal.ancestors(other), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === self) {
          return false;
        }
      }

      return nil;
    
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$<=', TMP_5 = function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil && $a != null) ? $a : $rb_lt(self, other));
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$>', TMP_6 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Module')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "compared with non class/module")
      };
      return $rb_lt(other, self);
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$>=', TMP_7 = function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil && $a != null) ? $a : $rb_gt(self, other));
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_8 = function(other) {
      var $a, self = this, lt = nil;

      
      if (self === other) {
        return 0;
      }
    
      if ((($a = $scope.get('Module')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      lt = $rb_lt(self, other);
      if ((($a = lt['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if (lt !== false && lt !== nil && lt != null) {
        return -1
        } else {
        return 1
      };
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$alias_method', TMP_9 = function $$alias_method(newname, oldname) {
      var self = this;

      Opal.alias(self, newname, oldname);
      return self;
    }, TMP_9.$$arity = 2);

    Opal.defn(self, '$alias_native', TMP_10 = function $$alias_native(mid, jsid) {
      var self = this;

      if (jsid == null) {
        jsid = mid;
      }
      Opal.alias_native(self, mid, jsid);
      return self;
    }, TMP_10.$$arity = -2);

    Opal.defn(self, '$ancestors', TMP_11 = function $$ancestors() {
      var self = this;

      return Opal.ancestors(self);
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$append_features', TMP_12 = function $$append_features(klass) {
      var self = this;

      Opal.append_features(self, klass);
      return self;
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$attr_accessor', TMP_13 = function $$attr_accessor($a_rest) {
      var $b, $c, self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      ($b = self).$attr_reader.apply($b, Opal.to_a(names));
      return ($c = self).$attr_writer.apply($c, Opal.to_a(names));
    }, TMP_13.$$arity = -1);

    Opal.alias(self, 'attr', 'attr_accessor');

    Opal.defn(self, '$attr_reader', TMP_14 = function $$attr_reader($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name,
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar) {
          return function() {
            if (this[ivar] == null) {
              return nil;
            }
            else {
              return this[ivar];
            }
          };
        })(ivar);

        // initialize the instance variable as nil
        proto[ivar] = nil;

        body.$$parameters = [];
        body.$$arity = 0;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    
      return nil;
    }, TMP_14.$$arity = -1);

    Opal.defn(self, '$attr_writer', TMP_15 = function $$attr_writer($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name + '=',
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar){
          return function(value) {
            return this[ivar] = value;
          }
        })(ivar);

        body.$$parameters = [['req']];
        body.$$arity = 1;

        // initialize the instance variable as nil
        proto[ivar] = nil;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    
      return nil;
    }, TMP_15.$$arity = -1);

    Opal.defn(self, '$autoload', TMP_16 = function $$autoload(const$, path) {
      var self = this;

      
      var autoloaders;

      if (!(autoloaders = self.$$autoload)) {
        autoloaders = self.$$autoload = {};
      }

      autoloaders[const$] = path;
      return nil;
    ;
    }, TMP_16.$$arity = 2);

    Opal.defn(self, '$class_variable_get', TMP_17 = function $$class_variable_get(name) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = name.length < 3 || name.slice(0,2) !== '@@') !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError').$new("class vars should start with @@", name))};
      
      var value = Opal.cvars[name.slice(2)];
      (function() {if ((($a = value == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('NameError').$new("uninitialized class variable @@a in", name))
        } else {
        return nil
      }; return nil; })()
      return value;
    
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$class_variable_set', TMP_18 = function $$class_variable_set(name, value) {
      var $a, self = this;

      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      if ((($a = name.length < 3 || name.slice(0,2) !== '@@') !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError'))};
      
      Opal.cvars[name.slice(2)] = value;
      return value;
    
    }, TMP_18.$$arity = 2);

    Opal.defn(self, '$constants', TMP_19 = function $$constants() {
      var self = this;

      return self.$$scope.constants.slice(0);
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$const_defined?', TMP_20 = function(name, inherit) {
      var $a, self = this;

      if (inherit == null) {
        inherit = true;
      }
      name = $scope.get('Opal')['$const_name!'](name);
      if ((($a = name['$=~']((($scope.get('Opal')).$$scope.get('CONST_NAME_REGEXP')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))
      };
      
      var scopes = [self.$$scope];

      if (inherit || self === Opal.Object) {
        var parent = self.$$super;

        while (parent !== Opal.BasicObject) {
          scopes.push(parent.$$scope);

          parent = parent.$$super;
        }
      }

      for (var i = 0, length = scopes.length; i < length; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return true;
        }
      }

      return false;
    
    }, TMP_20.$$arity = -2);

    Opal.defn(self, '$const_get', TMP_22 = function $$const_get(name, inherit) {
      var $a, $b, TMP_21, self = this;

      if (inherit == null) {
        inherit = true;
      }
      name = $scope.get('Opal')['$const_name!'](name);
      
      if (name.indexOf('::') === 0 && name !== '::'){
        name = name.slice(2);
      }
    
      if ((($a = name.indexOf('::') != -1 && name != '::') !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = name.$split("::")).$inject, $a.$$p = (TMP_21 = function(o, c){var self = TMP_21.$$s || this;
if (o == null) o = nil;if (c == null) c = nil;
        return o.$const_get(c)}, TMP_21.$$s = self, TMP_21.$$arity = 2, TMP_21), $a).call($b, self)};
      if ((($a = name['$=~']((($scope.get('Opal')).$$scope.get('CONST_NAME_REGEXP')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))
      };
      
      var scopes = [self.$$scope];

      if (inherit || self == Opal.Object) {
        var parent = self.$$super;

        while (parent !== Opal.BasicObject) {
          scopes.push(parent.$$scope);

          parent = parent.$$super;
        }
      }

      for (var i = 0, length = scopes.length; i < length; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return scopes[i][name];
        }
      }

      return self.$const_missing(name);
    
    }, TMP_22.$$arity = -2);

    Opal.defn(self, '$const_missing', TMP_23 = function $$const_missing(name) {
      var self = this, full_const_name = nil;

      
      if (self.$$autoload) {
        var file = self.$$autoload[name];

        if (file) {
          self.$require(file);

          return self.$const_get(name);
        }
      }
    
      full_const_name = (function() {if (self['$==']($scope.get('Object'))) {
        return name
        } else {
        return "" + (self) + "::" + (name)
      }; return nil; })();
      return self.$raise($scope.get('NameError').$new("uninitialized constant " + (full_const_name), name));
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$const_set', TMP_24 = function $$const_set(name, value) {
      var $a, $b, self = this;

      name = $scope.get('Opal')['$const_name!'](name);
      if ((($a = ((($b = (name['$=~']((($scope.get('Opal')).$$scope.get('CONST_NAME_REGEXP'))))['$!']()) !== false && $b !== nil && $b != null) ? $b : name['$start_with?']("::"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('NameError').$new("wrong constant name " + (name), name))};
      Opal.casgn(self, name, value);
      return value;
    }, TMP_24.$$arity = 2);

    Opal.defn(self, '$define_method', TMP_25 = function $$define_method(name, method) {
      var $a, $b, $c, TMP_26, self = this, $iter = TMP_25.$$p, block = $iter || nil, $case = nil;

      TMP_25.$$p = null;
      if ((($a = method === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "tried to create a Proc object without a block")};
      ((($a = block) !== false && $a !== nil && $a != null) ? $a : block = (function() {$case = method;if ($scope.get('Proc')['$===']($case)) {return method}else if ($scope.get('Method')['$===']($case)) {return method.$to_proc().$$unbound;}else if ($scope.get('UnboundMethod')['$===']($case)) {return ($b = ($c = self).$lambda, $b.$$p = (TMP_26 = function($d_rest){var self = TMP_26.$$s || this, args, $e, bound = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      bound = method.$bind(self);
        return ($e = bound).$call.apply($e, Opal.to_a(args));}, TMP_26.$$s = self, TMP_26.$$arity = -1, TMP_26), $b).call($c)}else {return self.$raise($scope.get('TypeError'), "wrong argument type " + (block.$class()) + " (expected Proc/Method)")}})());
      
      var id = '$' + name;

      block.$$jsid        = name;
      block.$$s           = null;
      block.$$def         = block;
      block.$$define_meth = true;

      Opal.defn(self, id, block);

      return name;
    
    }, TMP_25.$$arity = -2);

    Opal.defn(self, '$remove_method', TMP_27 = function $$remove_method($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.rdef(self, "$" + names[i]);
      }
    
      return self;
    }, TMP_27.$$arity = -1);

    Opal.defn(self, '$singleton_class?', TMP_28 = function() {
      var self = this;

      return !!self.$$is_singleton;
    }, TMP_28.$$arity = 0);

    Opal.defn(self, '$include', TMP_29 = function $$include($a_rest) {
      var self = this, mods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      mods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        mods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (mod === self) {
          continue;
        }

        if (!mod.$$is_module) {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(self);
        (mod).$included(self);
      }
    
      return self;
    }, TMP_29.$$arity = -1);

    Opal.defn(self, '$included_modules', TMP_30 = function $$included_modules() {
      var self = this;

      
      var results;

      var module_chain = function(klass) {
        var included = [];

        for (var i = 0; i != klass.$$inc.length; i++) {
          var mod_or_class = klass.$$inc[i];
          included.push(mod_or_class);
          included = included.concat(module_chain(mod_or_class));
        }

        return included;
      };

      results = module_chain(self);

      // need superclass's modules
      if (self.$$is_class) {
          for (var cls = self; cls; cls = cls.$$super) {
            results = results.concat(module_chain(cls));
          }
      }

      return results;
    
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$include?', TMP_31 = function(mod) {
      var self = this;

      
      for (var cls = self; cls; cls = cls.$$super) {
        for (var i = 0; i != cls.$$inc.length; i++) {
          var mod2 = cls.$$inc[i];
          if (mod === mod2) {
            return true;
          }
        }
      }
      return false;
    
    }, TMP_31.$$arity = 1);

    Opal.defn(self, '$instance_method', TMP_32 = function $$instance_method(name) {
      var self = this;

      
      var meth = self.$$proto['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise($scope.get('NameError').$new("undefined method `" + (name) + "' for class `" + (self.$name()) + "'", name));
      }

      return $scope.get('UnboundMethod').$new(self, meth, name);
    
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$instance_methods', TMP_33 = function $$instance_methods(include_super) {
      var self = this;

      if (include_super == null) {
        include_super = true;
      }
      
      var methods = [],
          proto   = self.$$proto;

      for (var prop in proto) {
        if (prop.charAt(0) !== '$') {
          continue;
        }

        if (typeof(proto[prop]) !== "function") {
          continue;
        }

        if (proto[prop].$$stub) {
          continue;
        }

        if (!self.$$is_module) {
          if (self !== Opal.BasicObject && proto[prop] === Opal.BasicObject.$$proto[prop]) {
            continue;
          }

          if (!include_super && !proto.hasOwnProperty(prop)) {
            continue;
          }

          if (!include_super && proto[prop].$$donated) {
            continue;
          }
        }

        methods.push(prop.substr(1));
      }

      return methods;
    
    }, TMP_33.$$arity = -1);

    Opal.defn(self, '$included', TMP_34 = function $$included(mod) {
      var self = this;

      return nil;
    }, TMP_34.$$arity = 1);

    Opal.defn(self, '$extended', TMP_35 = function $$extended(mod) {
      var self = this;

      return nil;
    }, TMP_35.$$arity = 1);

    Opal.defn(self, '$method_added', TMP_36 = function $$method_added($a_rest) {
      var self = this;

      return nil;
    }, TMP_36.$$arity = -1);

    Opal.defn(self, '$method_removed', TMP_37 = function $$method_removed($a_rest) {
      var self = this;

      return nil;
    }, TMP_37.$$arity = -1);

    Opal.defn(self, '$method_undefined', TMP_38 = function $$method_undefined($a_rest) {
      var self = this;

      return nil;
    }, TMP_38.$$arity = -1);

    Opal.defn(self, '$module_eval', TMP_39 = function $$module_eval($a_rest) {
      var $b, $c, TMP_40, self = this, args, $iter = TMP_39.$$p, block = $iter || nil, string = nil, file = nil, _lineno = nil, default_eval_options = nil, compiling_options = nil, compiled = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_39.$$p = null;
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?!!Opal.compile : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if ((($b = ($range(1, 3, false))['$cover?'](args.$size())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (0 for 1..3)")
        };
        $b = Opal.to_a(args), string = ($b[0] == null ? nil : $b[0]), file = ($b[1] == null ? nil : $b[1]), _lineno = ($b[2] == null ? nil : $b[2]), $b;
        default_eval_options = $hash2(["file", "eval"], {"file": (((($b = file) !== false && $b !== nil && $b != null) ? $b : "(eval)")), "eval": true});
        compiling_options = Opal.hash({ arity_check: false }).$merge(default_eval_options);
        compiled = $scope.get('Opal').$compile(string, compiling_options);
        block = ($b = ($c = $scope.get('Kernel')).$proc, $b.$$p = (TMP_40 = function(){var self = TMP_40.$$s || this;

        
          return (function(self) {
            return eval(compiled);
          })(self)
        }, TMP_40.$$s = self, TMP_40.$$arity = 0, TMP_40), $b).call($c);
      } else if ((($b = $rb_gt(args.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$size()) + " for 0)")};
      
      var old = block.$$s,
          result;

      block.$$s = null;
      result = block.apply(self, [self]);
      block.$$s = old;

      return result;
    
    }, TMP_39.$$arity = -1);

    Opal.alias(self, 'class_eval', 'module_eval');

    Opal.defn(self, '$module_exec', TMP_41 = function $$module_exec($a_rest) {
      var self = this, args, $iter = TMP_41.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_41.$$p = null;
      
      if (block === nil) {
        self.$raise($scope.get('LocalJumpError'), "no block given")
      }

      var block_self = block.$$s, result;

      block.$$s = null;
      result = block.apply(self, args);
      block.$$s = block_self;

      return result;
    ;
    }, TMP_41.$$arity = -1);

    Opal.alias(self, 'class_exec', 'module_exec');

    Opal.defn(self, '$method_defined?', TMP_42 = function(method) {
      var self = this;

      
      var body = self.$$proto['$' + method];
      return (!!body) && !body.$$stub;
    
    }, TMP_42.$$arity = 1);

    Opal.defn(self, '$module_function', TMP_43 = function $$module_function($a_rest) {
      var self = this, methods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      methods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        methods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (methods.length === 0) {
        self.$$module_function = true;
      }
      else {
        for (var i = 0, length = methods.length; i < length; i++) {
          var meth = methods[i],
              id   = '$' + meth,
              func = self.$$proto[id];

          Opal.defs(self, id, func);
        }
      }

      return self;
    
    }, TMP_43.$$arity = -1);

    Opal.defn(self, '$name', TMP_44 = function $$name() {
      var self = this;

      
      if (self.$$full_name) {
        return self.$$full_name;
      }

      var result = [], base = self;

      while (base) {
        if (base.$$name === nil) {
          return result.length === 0 ? nil : result.join('::');
        }

        result.unshift(base.$$name);

        base = base.$$base_module;

        if (base === Opal.Object) {
          break;
        }
      }

      if (result.length === 0) {
        return nil;
      }

      return self.$$full_name = result.join('::');
    
    }, TMP_44.$$arity = 0);

    Opal.defn(self, '$remove_class_variable', TMP_45 = function $$remove_class_variable($a_rest) {
      var self = this;

      return nil;
    }, TMP_45.$$arity = -1);

    Opal.defn(self, '$remove_const', TMP_46 = function $$remove_const(name) {
      var self = this;

      
      var old = self.$$scope[name];
      delete self.$$scope[name];
      return old;
    
    }, TMP_46.$$arity = 1);

    Opal.defn(self, '$to_s', TMP_47 = function $$to_s() {
      var $a, self = this;

      return ((($a = Opal.Module.$name.call(self)) !== false && $a !== nil && $a != null) ? $a : "#<" + (self.$$is_module ? 'Module' : 'Class') + ":0x" + (self.$__id__().$to_s(16)) + ">");
    }, TMP_47.$$arity = 0);

    Opal.defn(self, '$undef_method', TMP_48 = function $$undef_method($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.udef(self, "$" + names[i]);
      }
    
      return self;
    }, TMP_48.$$arity = -1);

    return (Opal.defn(self, '$instance_variables', TMP_49 = function $$instance_variables() {
      var self = this, consts = nil;

      consts = self.$constants();
      
      var result = [];

      for (var name in self) {
        if (self.hasOwnProperty(name) && name.charAt(0) !== '$' && name !== 'constructor' && !consts['$include?'](name)) {
          result.push('@' + name);
        }
      }

      return result;
    
    }, TMP_49.$$arity = 0), nil) && 'instance_variables';
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/class"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$allocate', '$name', '$to_s']);
  self.$require("corelib/module");
  return (function($base, $super) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6;

    Opal.defs(self, '$new', TMP_1 = function(superclass) {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      if (superclass == null) {
        superclass = $scope.get('Object');
      }
      TMP_1.$$p = null;
      
      if (!superclass.$$is_class) {
        throw Opal.TypeError.$new("superclass must be a Class");
      }

      var alloc = Opal.boot_class_alloc(null, function(){}, superclass)
      var klass = Opal.setup_class_object(null, alloc, superclass.$$name, superclass.constructor);

      klass.$$super = superclass;
      klass.$$parent = superclass;

      // inherit scope from parent
      Opal.create_scope(superclass.$$scope, klass);

      superclass.$inherited(klass);
      Opal.module_initialize(klass, block);

      return klass;
    
    }, TMP_1.$$arity = -1);

    Opal.defn(self, '$allocate', TMP_2 = function $$allocate() {
      var self = this;

      
      var obj = new self.$$alloc();
      obj.$$id = Opal.uid();
      return obj;
    
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$inherited', TMP_3 = function $$inherited(cls) {
      var self = this;

      return nil;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$new', TMP_4 = function($a_rest) {
      var self = this, args, $iter = TMP_4.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_4.$$p = null;
      
      var obj = self.$allocate();

      obj.$initialize.$$p = block;
      obj.$initialize.apply(obj, args);
      return obj;
    ;
    }, TMP_4.$$arity = -1);

    Opal.defn(self, '$superclass', TMP_5 = function $$superclass() {
      var self = this;

      return self.$$super || nil;
    }, TMP_5.$$arity = 0);

    return (Opal.defn(self, '$to_s', TMP_6 = function $$to_s() {
      var $a, $b, self = this, $iter = TMP_6.$$p, $yield = $iter || nil;

      TMP_6.$$p = null;
      
      var singleton_of = self.$$singleton_of;

      if (singleton_of && (singleton_of.$$is_class || singleton_of.$$is_module)) {
        return "#<Class:" + ((singleton_of).$name()) + ">";
      }
      else if (singleton_of) {
        // a singleton class created from an object
        return "#<Class:#<" + ((singleton_of.$$class).$name()) + ":0x" + ((singleton_of.$$id).$to_s(16)) + ">>";
      }
      return ($a = ($b = self, Opal.find_super_dispatcher(self, 'to_s', TMP_6, false)), $a.$$p = null, $a).call($b);
    
    }, TMP_6.$$arity = 0), nil) && 'to_s';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/basic_object"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range, $hash2 = Opal.hash2;

  Opal.add_stubs(['$==', '$!', '$nil?', '$cover?', '$size', '$raise', '$merge', '$compile', '$proc', '$>', '$new', '$inspect']);
  return (function($base, $super) {
    function $BasicObject(){};
    var self = $BasicObject = $klass($base, $super, 'BasicObject', $BasicObject);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14;

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize($a_rest) {
      var self = this;

      return nil;
    }, TMP_1.$$arity = -1);

    Opal.defn(self, '$==', TMP_2 = function(other) {
      var self = this;

      return self === other;
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$eql?', TMP_3 = function(other) {
      var self = this;

      return self['$=='](other);
    }, TMP_3.$$arity = 1);

    Opal.alias(self, 'equal?', '==');

    Opal.defn(self, '$__id__', TMP_4 = function $$__id__() {
      var self = this;

      return self.$$id || (self.$$id = Opal.uid());
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$__send__', TMP_5 = function $$__send__(symbol, $a_rest) {
      var self = this, args, $iter = TMP_5.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_5.$$p = null;
      
      var func = self['$' + symbol]

      if (func) {
        if (block !== nil) {
          func.$$p = block;
        }

        return func.apply(self, args);
      }

      if (block !== nil) {
        self.$method_missing.$$p = block;
      }

      return self.$method_missing.apply(self, [symbol].concat(args));
    
    }, TMP_5.$$arity = -2);

    Opal.defn(self, '$!', TMP_6 = function() {
      var self = this;

      return false;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$!=', TMP_7 = function(other) {
      var self = this;

      return (self['$=='](other))['$!']();
    }, TMP_7.$$arity = 1);

    Opal.alias(self, 'equal?', '==');

    Opal.defn(self, '$instance_eval', TMP_8 = function $$instance_eval($a_rest) {
      var $b, $c, TMP_9, self = this, args, $iter = TMP_8.$$p, block = $iter || nil, string = nil, file = nil, _lineno = nil, default_eval_options = nil, compiling_options = nil, compiled = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_8.$$p = null;
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?!!Opal.compile : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if ((($b = ($range(1, 3, false))['$cover?'](args.$size())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (0 for 1..3)")
        };
        $b = Opal.to_a(args), string = ($b[0] == null ? nil : $b[0]), file = ($b[1] == null ? nil : $b[1]), _lineno = ($b[2] == null ? nil : $b[2]), $b;
        default_eval_options = $hash2(["file", "eval"], {"file": (((($b = file) !== false && $b !== nil && $b != null) ? $b : "(eval)")), "eval": true});
        compiling_options = Opal.hash({ arity_check: false }).$merge(default_eval_options);
        compiled = $scope.get('Opal').$compile(string, compiling_options);
        block = ($b = ($c = $scope.get('Kernel')).$proc, $b.$$p = (TMP_9 = function(){var self = TMP_9.$$s || this;

        
          return (function(self) {
            return eval(compiled);
          })(self)
        }, TMP_9.$$s = self, TMP_9.$$arity = 0, TMP_9), $b).call($c);
      } else if ((($b = $rb_gt(args.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$size()) + " for 0)")};
      
      var old = block.$$s,
          result;

      block.$$s = null;

      // Need to pass $$eval so that method definitions know if this is
      // being done on a class/module. Cannot be compiler driven since
      // send(:instance_eval) needs to work.
      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.call(self, self);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.call(self, self);
      }

      block.$$s = old;

      return result;
    
    }, TMP_8.$$arity = -1);

    Opal.defn(self, '$instance_exec', TMP_10 = function $$instance_exec($a_rest) {
      var self = this, args, $iter = TMP_10.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_10.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "no block given")
      };
      
      var block_self = block.$$s,
          result;

      block.$$s = null;

      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.apply(self, args);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.apply(self, args);
      }

      block.$$s = block_self;

      return result;
    
    }, TMP_10.$$arity = -1);

    Opal.defn(self, '$singleton_method_added', TMP_11 = function $$singleton_method_added($a_rest) {
      var self = this;

      return nil;
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$singleton_method_removed', TMP_12 = function $$singleton_method_removed($a_rest) {
      var self = this;

      return nil;
    }, TMP_12.$$arity = -1);

    Opal.defn(self, '$singleton_method_undefined', TMP_13 = function $$singleton_method_undefined($a_rest) {
      var self = this;

      return nil;
    }, TMP_13.$$arity = -1);

    return (Opal.defn(self, '$method_missing', TMP_14 = function $$method_missing(symbol, $a_rest) {
      var $b, self = this, args, $iter = TMP_14.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_14.$$p = null;
      return $scope.get('Kernel').$raise($scope.get('NoMethodError').$new((function() {if ((($b = self.$inspect && !self.$inspect.$$stub) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return "undefined method `" + (symbol) + "' for " + (self.$inspect()) + ":" + (self.$$class)
        } else {
        return "undefined method `" + (symbol) + "' for " + (self.$$class)
      }; return nil; })(), symbol));
    }, TMP_14.$$arity = -2), nil) && 'method_missing';
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/kernel"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $gvars = Opal.gvars, $hash2 = Opal.hash2, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$new', '$inspect', '$!', '$=~', '$==', '$object_id', '$class', '$coerce_to?', '$<<', '$allocate', '$copy_instance_variables', '$copy_singleton_methods', '$initialize_clone', '$initialize_copy', '$define_method', '$to_proc', '$singleton_class', '$initialize_dup', '$for', '$>', '$size', '$pop', '$call', '$append_features', '$extended', '$length', '$respond_to?', '$[]', '$nil?', '$to_a', '$to_int', '$fetch', '$Integer', '$Float', '$to_ary', '$to_str', '$coerce_to', '$to_s', '$__id__', '$instance_variable_name!', '$coerce_to!', '$===', '$enum_for', '$print', '$format', '$puts', '$each', '$<=', '$empty?', '$exception', '$kind_of?', '$respond_to_missing?', '$try_convert!', '$expand_path', '$join', '$start_with?', '$sym', '$arg', '$open', '$include']);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_43, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_60, TMP_61, TMP_62, TMP_63;

    Opal.defn(self, '$method_missing', TMP_1 = function $$method_missing(symbol, $a_rest) {
      var self = this, args, $iter = TMP_1.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_1.$$p = null;
      return self.$raise($scope.get('NoMethodError').$new("undefined method `" + (symbol) + "' for " + (self.$inspect()), symbol, args));
    }, TMP_1.$$arity = -2);

    Opal.defn(self, '$=~', TMP_2 = function(obj) {
      var self = this;

      return false;
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$!~', TMP_3 = function(obj) {
      var self = this;

      return (self['$=~'](obj))['$!']();
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$===', TMP_4 = function(other) {
      var $a, self = this;

      return ((($a = self.$object_id()['$=='](other.$object_id())) !== false && $a !== nil && $a != null) ? $a : self['$=='](other));
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_5 = function(other) {
      var self = this;

      
      // set guard for infinite recursion
      self.$$comparable = true;

      var x = self['$=='](other);

      if (x && x !== nil) {
        return 0;
      }

      return nil;
    
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$method', TMP_6 = function $$method(name) {
      var self = this;

      
      var meth = self['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise($scope.get('NameError').$new("undefined method `" + (name) + "' for class `" + (self.$class()) + "'", name));
      }

      return $scope.get('Method').$new(self, meth, name);
    
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$methods', TMP_7 = function $$methods(all) {
      var self = this;

      if (all == null) {
        all = true;
      }
      
      var methods = [];

      for (var key in self) {
        if (key[0] == "$" && typeof(self[key]) === "function") {
          if (all == false || all === nil) {
            if (!Opal.hasOwnProperty.call(self, key)) {
              continue;
            }
          }
          if (self[key].$$stub === undefined) {
            methods.push(key.substr(1));
          }
        }
      }

      return methods;
    
    }, TMP_7.$$arity = -1);

    Opal.alias(self, 'public_methods', 'methods');

    Opal.defn(self, '$Array', TMP_8 = function $$Array(object) {
      var self = this;

      
      var coerced;

      if (object === nil) {
        return [];
      }

      if (object.$$is_array) {
        return object;
      }

      coerced = $scope.get('Opal')['$coerce_to?'](object, $scope.get('Array'), "to_ary");
      if (coerced !== nil) { return coerced; }

      coerced = $scope.get('Opal')['$coerce_to?'](object, $scope.get('Array'), "to_a");
      if (coerced !== nil) { return coerced; }

      return [object];
    
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$at_exit', TMP_9 = function $$at_exit() {
      var $a, self = this, $iter = TMP_9.$$p, block = $iter || nil;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      TMP_9.$$p = null;
      ((($a = $gvars.__at_exit__) !== false && $a !== nil && $a != null) ? $a : $gvars.__at_exit__ = []);
      return $gvars.__at_exit__['$<<'](block);
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$caller', TMP_10 = function $$caller() {
      var self = this;

      return [];
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$class', TMP_11 = function() {
      var self = this;

      return self.$$class;
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$copy_instance_variables', TMP_12 = function $$copy_instance_variables(other) {
      var self = this;

      
      for (var name in other) {
        if (other.hasOwnProperty(name) && name.charAt(0) !== '$') {
          self[name] = other[name];
        }
      }
    
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$copy_singleton_methods', TMP_13 = function $$copy_singleton_methods(other) {
      var self = this;

      
      var name;

      if (other.hasOwnProperty('$$meta')) {
        var other_singleton_class_proto = Opal.get_singleton_class(other).$$proto;
        var self_singleton_class_proto = Opal.get_singleton_class(self).$$proto;

        for (name in other_singleton_class_proto) {
          if (name.charAt(0) === '$' && other_singleton_class_proto.hasOwnProperty(name)) {
            self_singleton_class_proto[name] = other_singleton_class_proto[name];
          }
        }
      }

      for (name in other) {
        if (name.charAt(0) === '$' && name.charAt(1) !== '$' && other.hasOwnProperty(name)) {
          self[name] = other[name];
        }
      }
    
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$clone', TMP_14 = function $$clone() {
      var self = this, copy = nil;

      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$initialize_clone', TMP_15 = function $$initialize_clone(other) {
      var self = this;

      return self.$initialize_copy(other);
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$define_singleton_method', TMP_16 = function $$define_singleton_method(name, method) {
      var $a, $b, self = this, $iter = TMP_16.$$p, block = $iter || nil;

      TMP_16.$$p = null;
      return ($a = ($b = self.$singleton_class()).$define_method, $a.$$p = block.$to_proc(), $a).call($b, name, method);
    }, TMP_16.$$arity = -2);

    Opal.defn(self, '$dup', TMP_17 = function $$dup() {
      var self = this, copy = nil;

      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    }, TMP_17.$$arity = 0);

    Opal.defn(self, '$initialize_dup', TMP_18 = function $$initialize_dup(other) {
      var self = this;

      return self.$initialize_copy(other);
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$enum_for', TMP_19 = function $$enum_for(method, $a_rest) {
      var $b, $c, self = this, args, $iter = TMP_19.$$p, block = $iter || nil;

      if (method == null) {
        method = "each";
      }
      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_19.$$p = null;
      return ($b = ($c = $scope.get('Enumerator')).$for, $b.$$p = block.$to_proc(), $b).apply($c, [self, method].concat(Opal.to_a(args)));
    }, TMP_19.$$arity = -1);

    Opal.alias(self, 'to_enum', 'enum_for');

    Opal.defn(self, '$equal?', TMP_20 = function(other) {
      var self = this;

      return self === other;
    }, TMP_20.$$arity = 1);

    Opal.defn(self, '$exit', TMP_21 = function $$exit(status) {
      var $a, $b, self = this, block = nil;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      if (status == null) {
        status = true;
      }
      ((($a = $gvars.__at_exit__) !== false && $a !== nil && $a != null) ? $a : $gvars.__at_exit__ = []);
      while ((($b = $rb_gt($gvars.__at_exit__.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      block = $gvars.__at_exit__.$pop();
      block.$call();};
      if ((($a = status === true) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        status = 0};
      Opal.exit(status);
      return nil;
    }, TMP_21.$$arity = -1);

    Opal.defn(self, '$extend', TMP_22 = function $$extend($a_rest) {
      var self = this, mods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      mods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        mods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var singleton = self.$singleton_class();

      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (!mod.$$is_module) {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(singleton);
        (mod).$extended(self);
      }
    ;
      return self;
    }, TMP_22.$$arity = -1);

    Opal.defn(self, '$format', TMP_23 = function $$format(format_string, $a_rest) {
      var $b, $c, self = this, args, ary = nil;
      if ($gvars.DEBUG == null) $gvars.DEBUG = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      if ((($b = (($c = args.$length()['$=='](1)) ? args['$[]'](0)['$respond_to?']("to_ary") : args.$length()['$=='](1))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        ary = $scope.get('Opal')['$coerce_to?'](args['$[]'](0), $scope.get('Array'), "to_ary");
        if ((($b = ary['$nil?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          args = ary.$to_a()
        };};
      
      var result = '',
          //used for slicing:
          begin_slice = 0,
          end_slice,
          //used for iterating over the format string:
          i,
          len = format_string.length,
          //used for processing field values:
          arg,
          str,
          //used for processing %g and %G fields:
          exponent,
          //used for keeping track of width and precision:
          width,
          precision,
          //used for holding temporary values:
          tmp_num,
          //used for processing %{} and %<> fileds:
          hash_parameter_key,
          closing_brace_char,
          //used for processing %b, %B, %o, %x, and %X fields:
          base_number,
          base_prefix,
          base_neg_zero_regex,
          base_neg_zero_digit,
          //used for processing arguments:
          next_arg,
          seq_arg_num = 1,
          pos_arg_num = 0,
          //used for keeping track of flags:
          flags,
          FNONE  = 0,
          FSHARP = 1,
          FMINUS = 2,
          FPLUS  = 4,
          FZERO  = 8,
          FSPACE = 16,
          FWIDTH = 32,
          FPREC  = 64,
          FPREC0 = 128;

      function CHECK_FOR_FLAGS() {
        if (flags&FWIDTH) { self.$raise($scope.get('ArgumentError'), "flag after width") }
        if (flags&FPREC0) { self.$raise($scope.get('ArgumentError'), "flag after precision") }
      }

      function CHECK_FOR_WIDTH() {
        if (flags&FWIDTH) { self.$raise($scope.get('ArgumentError'), "width given twice") }
        if (flags&FPREC0) { self.$raise($scope.get('ArgumentError'), "width after precision") }
      }

      function GET_NTH_ARG(num) {
        if (num >= args.length) { self.$raise($scope.get('ArgumentError'), "too few arguments") }
        return args[num];
      }

      function GET_NEXT_ARG() {
        switch (pos_arg_num) {
        case -1: self.$raise($scope.get('ArgumentError'), "unnumbered(" + (seq_arg_num) + ") mixed with numbered")
        case -2: self.$raise($scope.get('ArgumentError'), "unnumbered(" + (seq_arg_num) + ") mixed with named")
        }
        pos_arg_num = seq_arg_num++;
        return GET_NTH_ARG(pos_arg_num - 1);
      }

      function GET_POS_ARG(num) {
        if (pos_arg_num > 0) {
          self.$raise($scope.get('ArgumentError'), "numbered(" + (num) + ") after unnumbered(" + (pos_arg_num) + ")")
        }
        if (pos_arg_num === -2) {
          self.$raise($scope.get('ArgumentError'), "numbered(" + (num) + ") after named")
        }
        if (num < 1) {
          self.$raise($scope.get('ArgumentError'), "invalid index - " + (num) + "$")
        }
        pos_arg_num = -1;
        return GET_NTH_ARG(num - 1);
      }

      function GET_ARG() {
        return (next_arg === undefined ? GET_NEXT_ARG() : next_arg);
      }

      function READ_NUM(label) {
        var num, str = '';
        for (;; i++) {
          if (i === len) {
            self.$raise($scope.get('ArgumentError'), "malformed format string - %*[0-9]")
          }
          if (format_string.charCodeAt(i) < 48 || format_string.charCodeAt(i) > 57) {
            i--;
            num = parseInt(str, 10) || 0;
            if (num > 2147483647) {
              self.$raise($scope.get('ArgumentError'), "" + (label) + " too big")
            }
            return num;
          }
          str += format_string.charAt(i);
        }
      }

      function READ_NUM_AFTER_ASTER(label) {
        var arg, num = READ_NUM(label);
        if (format_string.charAt(i + 1) === '$') {
          i++;
          arg = GET_POS_ARG(num);
        } else {
          arg = GET_NEXT_ARG();
        }
        return (arg).$to_int();
      }

      for (i = format_string.indexOf('%'); i !== -1; i = format_string.indexOf('%', i)) {
        str = undefined;

        flags = FNONE;
        width = -1;
        precision = -1;
        next_arg = undefined;

        end_slice = i;

        i++;

        switch (format_string.charAt(i)) {
        case '%':
          begin_slice = i;
        case '':
        case '\n':
        case '\0':
          i++;
          continue;
        }

        format_sequence: for (; i < len; i++) {
          switch (format_string.charAt(i)) {

          case ' ':
            CHECK_FOR_FLAGS();
            flags |= FSPACE;
            continue format_sequence;

          case '#':
            CHECK_FOR_FLAGS();
            flags |= FSHARP;
            continue format_sequence;

          case '+':
            CHECK_FOR_FLAGS();
            flags |= FPLUS;
            continue format_sequence;

          case '-':
            CHECK_FOR_FLAGS();
            flags |= FMINUS;
            continue format_sequence;

          case '0':
            CHECK_FOR_FLAGS();
            flags |= FZERO;
            continue format_sequence;

          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            tmp_num = READ_NUM('width');
            if (format_string.charAt(i + 1) === '$') {
              if (i + 2 === len) {
                str = '%';
                i++;
                break format_sequence;
              }
              if (next_arg !== undefined) {
                self.$raise($scope.get('ArgumentError'), "value given twice - %" + (tmp_num) + "$")
              }
              next_arg = GET_POS_ARG(tmp_num);
              i++;
            } else {
              CHECK_FOR_WIDTH();
              flags |= FWIDTH;
              width = tmp_num;
            }
            continue format_sequence;

          case '<':
          case '\{':
            closing_brace_char = (format_string.charAt(i) === '<' ? '>' : '\}');
            hash_parameter_key = '';

            i++;

            for (;; i++) {
              if (i === len) {
                self.$raise($scope.get('ArgumentError'), "malformed name - unmatched parenthesis")
              }
              if (format_string.charAt(i) === closing_brace_char) {

                if (pos_arg_num > 0) {
                  self.$raise($scope.get('ArgumentError'), "named " + (hash_parameter_key) + " after unnumbered(" + (pos_arg_num) + ")")
                }
                if (pos_arg_num === -1) {
                  self.$raise($scope.get('ArgumentError'), "named " + (hash_parameter_key) + " after numbered")
                }
                pos_arg_num = -2;

                if (args[0] === undefined || !args[0].$$is_hash) {
                  self.$raise($scope.get('ArgumentError'), "one hash required")
                }

                next_arg = (args[0]).$fetch(hash_parameter_key);

                if (closing_brace_char === '>') {
                  continue format_sequence;
                } else {
                  str = next_arg.toString();
                  if (precision !== -1) { str = str.slice(0, precision); }
                  if (flags&FMINUS) {
                    while (str.length < width) { str = str + ' '; }
                  } else {
                    while (str.length < width) { str = ' ' + str; }
                  }
                  break format_sequence;
                }
              }
              hash_parameter_key += format_string.charAt(i);
            }

          case '*':
            i++;
            CHECK_FOR_WIDTH();
            flags |= FWIDTH;
            width = READ_NUM_AFTER_ASTER('width');
            if (width < 0) {
              flags |= FMINUS;
              width = -width;
            }
            continue format_sequence;

          case '.':
            if (flags&FPREC0) {
              self.$raise($scope.get('ArgumentError'), "precision given twice")
            }
            flags |= FPREC|FPREC0;
            precision = 0;
            i++;
            if (format_string.charAt(i) === '*') {
              i++;
              precision = READ_NUM_AFTER_ASTER('precision');
              if (precision < 0) {
                flags &= ~FPREC;
              }
              continue format_sequence;
            }
            precision = READ_NUM('precision');
            continue format_sequence;

          case 'd':
          case 'i':
          case 'u':
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              str = (-arg).toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            break format_sequence;

          case 'b':
          case 'B':
          case 'o':
          case 'x':
          case 'X':
            switch (format_string.charAt(i)) {
            case 'b':
            case 'B':
              base_number = 2;
              base_prefix = '0b';
              base_neg_zero_regex = /^1+/;
              base_neg_zero_digit = '1';
              break;
            case 'o':
              base_number = 8;
              base_prefix = '0';
              base_neg_zero_regex = /^3?7+/;
              base_neg_zero_digit = '7';
              break;
            case 'x':
            case 'X':
              base_number = 16;
              base_prefix = '0x';
              base_neg_zero_regex = /^f+/;
              base_neg_zero_digit = 'f';
              break;
            }
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString(base_number);
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0) - ((flags&FSHARP && arg !== 0) ? base_prefix.length : 0)) { str = '0' + str; }
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (flags&FPLUS || flags&FSPACE) {
                str = (-arg).toString(base_number);
                while (str.length < precision) { str = '0' + str; }
                if (flags&FMINUS) {
                  if (flags&FSHARP) { str = base_prefix + str; }
                  str = '-' + str;
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 1 - (flags&FSHARP ? 2 : 0)) { str = '0' + str; }
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                  } else {
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              } else {
                str = (arg >>> 0).toString(base_number).replace(base_neg_zero_regex, base_neg_zero_digit);
                while (str.length < precision - 2) { str = base_neg_zero_digit + str; }
                if (flags&FMINUS) {
                  str = '..' + str;
                  if (flags&FSHARP) { str = base_prefix + str; }
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 2 - (flags&FSHARP ? base_prefix.length : 0)) { str = base_neg_zero_digit + str; }
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                  } else {
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase()) {
              str = str.toUpperCase();
            }
            break format_sequence;

          case 'f':
          case 'e':
          case 'E':
          case 'g':
          case 'G':
            arg = self.$Float(GET_ARG());
            if (arg >= 0 || isNaN(arg)) {
              if (arg === Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = arg.toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = arg.toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = arg.toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = arg.toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== Infinity && !isNaN(arg)) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (arg === -Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = (-arg).toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = (-arg).toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = (-arg).toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = (-arg).toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== -Infinity) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase() && arg !== Infinity && arg !== -Infinity && !isNaN(arg)) {
              str = str.toUpperCase();
            }
            str = str.replace(/([eE][-+]?)([0-9])$/, '$10$2');
            break format_sequence;

          case 'a':
          case 'A':
            // Not implemented because there are no specs for this field type.
            self.$raise($scope.get('NotImplementedError'), "`A` and `a` format field types are not implemented in Opal yet")

          case 'c':
            arg = GET_ARG();
            if ((arg)['$respond_to?']("to_ary")) { arg = (arg).$to_ary()[0]; }
            if ((arg)['$respond_to?']("to_str")) {
              str = (arg).$to_str();
            } else {
              str = String.fromCharCode($scope.get('Opal').$coerce_to(arg, $scope.get('Integer'), "to_int"));
            }
            if (str.length !== 1) {
              self.$raise($scope.get('ArgumentError'), "%c requires a character")
            }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 'p':
            str = (GET_ARG()).$inspect();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 's':
            str = (GET_ARG()).$to_s();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          default:
            self.$raise($scope.get('ArgumentError'), "malformed format string - %" + (format_string.charAt(i)))
          }
        }

        if (str === undefined) {
          self.$raise($scope.get('ArgumentError'), "malformed format string - %")
        }

        result += format_string.slice(begin_slice, end_slice) + str;
        begin_slice = i + 1;
      }

      if ($gvars.DEBUG && pos_arg_num >= 0 && seq_arg_num < args.length) {
        self.$raise($scope.get('ArgumentError'), "too many arguments for format string")
      }

      return result + format_string.slice(begin_slice);
    ;
    }, TMP_23.$$arity = -2);

    Opal.defn(self, '$hash', TMP_24 = function $$hash() {
      var self = this;

      return self.$__id__();
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$initialize_copy', TMP_25 = function $$initialize_copy(other) {
      var self = this;

      return nil;
    }, TMP_25.$$arity = 1);

    Opal.defn(self, '$inspect', TMP_26 = function $$inspect() {
      var self = this;

      return self.$to_s();
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$instance_of?', TMP_27 = function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise($scope.get('TypeError'), "class or module required");
      }

      return self.$$class === klass;
    ;
    }, TMP_27.$$arity = 1);

    Opal.defn(self, '$instance_variable_defined?', TMP_28 = function(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      return Opal.hasOwnProperty.call(self, name.substr(1));
    }, TMP_28.$$arity = 1);

    Opal.defn(self, '$instance_variable_get', TMP_29 = function $$instance_variable_get(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      
      var ivar = self[Opal.ivar(name.substr(1))];

      return ivar == null ? nil : ivar;
    
    }, TMP_29.$$arity = 1);

    Opal.defn(self, '$instance_variable_set', TMP_30 = function $$instance_variable_set(name, value) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      return self[Opal.ivar(name.substr(1))] = value;
    }, TMP_30.$$arity = 2);

    Opal.defn(self, '$remove_instance_variable', TMP_31 = function $$remove_instance_variable(name) {
      var self = this;

      name = $scope.get('Opal')['$instance_variable_name!'](name);
      
      var key = Opal.ivar(name.substr(1)),
          val;
      if (self.hasOwnProperty(key)) {
        val = self[key];
        delete self[key];
        return val;
      }
    
      return self.$raise($scope.get('NameError'), "instance variable " + (name) + " not defined");
    }, TMP_31.$$arity = 1);

    Opal.defn(self, '$instance_variables', TMP_32 = function $$instance_variables() {
      var self = this;

      
      var result = [], ivar;

      for (var name in self) {
        if (self.hasOwnProperty(name) && name.charAt(0) !== '$') {
          if (name.substr(-1) === '$') {
            ivar = name.slice(0, name.length - 1);
          } else {
            ivar = name;
          }
          result.push('@' + ivar);
        }
      }

      return result;
    
    }, TMP_32.$$arity = 0);

    Opal.defn(self, '$Integer', TMP_33 = function $$Integer(value, base) {
      var self = this;

      
      var i, str, base_digits;

      if (!value.$$is_string) {
        if (base !== undefined) {
          self.$raise($scope.get('ArgumentError'), "base specified for non string value")
        }
        if (value === nil) {
          self.$raise($scope.get('TypeError'), "can't convert nil into Integer")
        }
        if (value.$$is_number) {
          if (value === Infinity || value === -Infinity || isNaN(value)) {
            self.$raise($scope.get('FloatDomainError'), value)
          }
          return Math.floor(value);
        }
        if (value['$respond_to?']("to_int")) {
          i = value.$to_int();
          if (i !== nil) {
            return i;
          }
        }
        return $scope.get('Opal')['$coerce_to!'](value, $scope.get('Integer'), "to_i");
      }

      if (base === undefined) {
        base = 0;
      } else {
        base = $scope.get('Opal').$coerce_to(base, $scope.get('Integer'), "to_int");
        if (base === 1 || base < 0 || base > 36) {
          self.$raise($scope.get('ArgumentError'), "invalid radix " + (base))
        }
      }

      str = value.toLowerCase();

      str = str.replace(/(\d)_(?=\d)/g, '$1');

      str = str.replace(/^(\s*[+-]?)(0[bodx]?)/, function (_, head, flag) {
        switch (flag) {
        case '0b':
          if (base === 0 || base === 2) {
            base = 2;
            return head;
          }
        case '0':
        case '0o':
          if (base === 0 || base === 8) {
            base = 8;
            return head;
          }
        case '0d':
          if (base === 0 || base === 10) {
            base = 10;
            return head;
          }
        case '0x':
          if (base === 0 || base === 16) {
            base = 16;
            return head;
          }
        }
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      });

      base = (base === 0 ? 10 : base);

      base_digits = '0-' + (base <= 10 ? base - 1 : '9a-' + String.fromCharCode(97 + (base - 11)));

      if (!(new RegExp('^\\s*[+-]?[' + base_digits + ']+\\s*$')).test(str)) {
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      }

      i = parseInt(str, base);

      if (isNaN(i)) {
        self.$raise($scope.get('ArgumentError'), "invalid value for Integer(): \"" + (value) + "\"")
      }

      return i;
    ;
    }, TMP_33.$$arity = -2);

    Opal.defn(self, '$Float', TMP_34 = function $$Float(value) {
      var self = this;

      
      var str;

      if (value === nil) {
        self.$raise($scope.get('TypeError'), "can't convert nil into Float")
      }

      if (value.$$is_string) {
        str = value.toString();

        str = str.replace(/(\d)_(?=\d)/g, '$1');

        //Special case for hex strings only:
        if (/^\s*[-+]?0[xX][0-9a-fA-F]+\s*$/.test(str)) {
          return self.$Integer(str);
        }

        if (!/^\s*[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?\s*$/.test(str)) {
          self.$raise($scope.get('ArgumentError'), "invalid value for Float(): \"" + (value) + "\"")
        }

        return parseFloat(str);
      }

      return $scope.get('Opal')['$coerce_to!'](value, $scope.get('Float'), "to_f");
    
    }, TMP_34.$$arity = 1);

    Opal.defn(self, '$Hash', TMP_35 = function $$Hash(arg) {
      var $a, $b, self = this;

      if ((($a = ((($b = arg['$nil?']()) !== false && $b !== nil && $b != null) ? $b : arg['$==']([]))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $hash2([], {})};
      if ((($a = $scope.get('Hash')['$==='](arg)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return arg};
      return $scope.get('Opal')['$coerce_to!'](arg, $scope.get('Hash'), "to_hash");
    }, TMP_35.$$arity = 1);

    Opal.defn(self, '$is_a?', TMP_36 = function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise($scope.get('TypeError'), "class or module required");
      }

      return Opal.is_a(self, klass);
    ;
    }, TMP_36.$$arity = 1);

    Opal.alias(self, 'kind_of?', 'is_a?');

    Opal.defn(self, '$lambda', TMP_37 = function $$lambda() {
      var self = this, $iter = TMP_37.$$p, block = $iter || nil;

      TMP_37.$$p = null;
      block.$$is_lambda = true;
      return block;
    }, TMP_37.$$arity = 0);

    Opal.defn(self, '$load', TMP_38 = function $$load(file) {
      var self = this;

      file = $scope.get('Opal')['$coerce_to!'](file, $scope.get('String'), "to_str");
      return Opal.load(file);
    }, TMP_38.$$arity = 1);

    Opal.defn(self, '$loop', TMP_39 = function $$loop() {
      var self = this, $iter = TMP_39.$$p, $yield = $iter || nil;

      TMP_39.$$p = null;
      if (($yield !== nil)) {
        } else {
        return self.$enum_for("loop")
      };
      
      while (true) {
        Opal.yieldX($yield, [])
      }
    ;
      return self;
    }, TMP_39.$$arity = 0);

    Opal.defn(self, '$nil?', TMP_40 = function() {
      var self = this;

      return false;
    }, TMP_40.$$arity = 0);

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$printf', TMP_41 = function $$printf($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      if ((($b = $rb_gt(args.$length(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$print(($b = self).$format.apply($b, Opal.to_a(args)))};
      return nil;
    }, TMP_41.$$arity = -1);

    Opal.defn(self, '$proc', TMP_42 = function $$proc() {
      var self = this, $iter = TMP_42.$$p, block = $iter || nil;

      TMP_42.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        self.$raise($scope.get('ArgumentError'), "tried to create Proc object without a block")
      };
      block.$$is_lambda = false;
      return block;
    }, TMP_42.$$arity = 0);

    Opal.defn(self, '$puts', TMP_43 = function $$puts($a_rest) {
      var $b, self = this, strs;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = $gvars.stdout).$puts.apply($b, Opal.to_a(strs));
    }, TMP_43.$$arity = -1);

    Opal.defn(self, '$p', TMP_45 = function $$p($a_rest) {
      var $b, $c, TMP_44, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      ($b = ($c = args).$each, $b.$$p = (TMP_44 = function(obj){var self = TMP_44.$$s || this;
        if ($gvars.stdout == null) $gvars.stdout = nil;
if (obj == null) obj = nil;
      return $gvars.stdout.$puts(obj.$inspect())}, TMP_44.$$s = self, TMP_44.$$arity = 1, TMP_44), $b).call($c);
      if ((($b = $rb_le(args.$length(), 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return args['$[]'](0)
        } else {
        return args
      };
    }, TMP_45.$$arity = -1);

    Opal.defn(self, '$print', TMP_46 = function $$print($a_rest) {
      var $b, self = this, strs;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = $gvars.stdout).$print.apply($b, Opal.to_a(strs));
    }, TMP_46.$$arity = -1);

    Opal.defn(self, '$warn', TMP_47 = function $$warn($a_rest) {
      var $b, $c, self = this, strs;
      if ($gvars.VERBOSE == null) $gvars.VERBOSE = nil;
      if ($gvars.stderr == null) $gvars.stderr = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      if ((($b = ((($c = $gvars.VERBOSE['$nil?']()) !== false && $c !== nil && $c != null) ? $c : strs['$empty?']())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return nil
        } else {
        return ($b = $gvars.stderr).$puts.apply($b, Opal.to_a(strs))
      };
    }, TMP_47.$$arity = -1);

    Opal.defn(self, '$raise', TMP_48 = function $$raise(exception, string, _backtrace) {
      var self = this;
      if ($gvars["!"] == null) $gvars["!"] = nil;

      if (string == null) {
        string = nil;
      }
      if (_backtrace == null) {
        _backtrace = nil;
      }
      
      if (exception == null && $gvars["!"] !== nil) {
        throw $gvars["!"];
      }
      if (exception == null) {
        exception = $scope.get('RuntimeError').$new();
      }
      else if (exception.$$is_string) {
        exception = $scope.get('RuntimeError').$new(exception);
      }
      // using respond_to? and not an undefined check to avoid method_missing matching as true
      else if (exception.$$is_class && exception['$respond_to?']("exception")) {
        exception = exception.$exception(string);
      }
      else if (exception['$kind_of?']($scope.get('Exception'))) {
        // exception is fine
      }
      else {
        exception = $scope.get('TypeError').$new("exception class/object expected");
      }

      if ($gvars["!"] !== nil) {
        Opal.exceptions.push($gvars["!"]);
      }

      $gvars["!"] = exception;

      throw exception;
    ;
    }, TMP_48.$$arity = -1);

    Opal.alias(self, 'fail', 'raise');

    Opal.defn(self, '$rand', TMP_49 = function $$rand(max) {
      var self = this;

      
      if (max === undefined) {
        return Math.random();
      }
      else if (max.$$is_range) {
        var min = max.begin, range = max.end - min;
        if(!max.exclude) range++;

        return self.$rand(range) + min;
      }
      else {
        return Math.floor(Math.random() *
          Math.abs($scope.get('Opal').$coerce_to(max, $scope.get('Integer'), "to_int")));
      }
    
    }, TMP_49.$$arity = -1);

    Opal.defn(self, '$respond_to?', TMP_50 = function(name, include_all) {
      var $a, self = this;

      if (include_all == null) {
        include_all = false;
      }
      if ((($a = self['$respond_to_missing?'](name, include_all)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      
      var body = self['$' + name];

      if (typeof(body) === "function" && !body.$$stub) {
        return true;
      }
    
      return false;
    }, TMP_50.$$arity = -2);

    Opal.defn(self, '$respond_to_missing?', TMP_51 = function(method_name, include_all) {
      var self = this;

      if (include_all == null) {
        include_all = false;
      }
      return false;
    }, TMP_51.$$arity = -2);

    Opal.defn(self, '$require', TMP_52 = function $$require(file) {
      var self = this;

      file = $scope.get('Opal')['$coerce_to!'](file, $scope.get('String'), "to_str");
      return Opal.require(file);
    }, TMP_52.$$arity = 1);

    Opal.defn(self, '$require_relative', TMP_53 = function $$require_relative(file) {
      var self = this;

      $scope.get('Opal')['$try_convert!'](file, $scope.get('String'), "to_str");
      file = $scope.get('File').$expand_path($scope.get('File').$join(Opal.current_file, "..", file));
      return Opal.require(file);
    }, TMP_53.$$arity = 1);

    Opal.defn(self, '$require_tree', TMP_54 = function $$require_tree(path) {
      var self = this;

      path = $scope.get('File').$expand_path(path);
      if (path['$=='](".")) {
        path = ""};
      
      for (var name in Opal.modules) {
        if ((name)['$start_with?'](path)) {
          Opal.require(name);
        }
      }
    ;
      return nil;
    }, TMP_54.$$arity = 1);

    Opal.alias(self, 'send', '__send__');

    Opal.alias(self, 'public_send', '__send__');

    Opal.defn(self, '$singleton_class', TMP_55 = function $$singleton_class() {
      var self = this;

      return Opal.get_singleton_class(self);
    }, TMP_55.$$arity = 0);

    Opal.defn(self, '$sleep', TMP_56 = function $$sleep(seconds) {
      var self = this;

      if (seconds == null) {
        seconds = nil;
      }
      
      if (seconds === nil) {
        self.$raise($scope.get('TypeError'), "can't convert NilClass into time interval")
      }
      if (!seconds.$$is_number) {
        self.$raise($scope.get('TypeError'), "can't convert " + (seconds.$class()) + " into time interval")
      }
      if (seconds < 0) {
        self.$raise($scope.get('ArgumentError'), "time interval must be positive")
      }
      var t = new Date();
      while (new Date() - t <= seconds * 1000);
      return seconds;
    ;
    }, TMP_56.$$arity = -1);

    Opal.alias(self, 'sprintf', 'format');

    Opal.alias(self, 'srand', 'rand');

    Opal.defn(self, '$String', TMP_57 = function $$String(str) {
      var $a, self = this;

      return ((($a = $scope.get('Opal')['$coerce_to?'](str, $scope.get('String'), "to_str")) !== false && $a !== nil && $a != null) ? $a : $scope.get('Opal')['$coerce_to!'](str, $scope.get('String'), "to_s"));
    }, TMP_57.$$arity = 1);

    Opal.defn(self, '$tap', TMP_58 = function $$tap() {
      var self = this, $iter = TMP_58.$$p, block = $iter || nil;

      TMP_58.$$p = null;
      Opal.yield1(block, self);
      return self;
    }, TMP_58.$$arity = 0);

    Opal.defn(self, '$to_proc', TMP_59 = function $$to_proc() {
      var self = this;

      return self;
    }, TMP_59.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_60 = function $$to_s() {
      var self = this;

      return "#<" + (self.$class()) + ":0x" + (self.$__id__().$to_s(16)) + ">";
    }, TMP_60.$$arity = 0);

    Opal.defn(self, '$catch', TMP_61 = function(sym) {
      var self = this, $iter = TMP_61.$$p, $yield = $iter || nil, e = nil;

      TMP_61.$$p = null;
      try {
        return Opal.yieldX($yield, []);
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('UncaughtThrowError')])) {e = $err;
          try {
            if (e.$sym()['$=='](sym)) {
              return e.$arg()};
            return self.$raise();
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_61.$$arity = 1);

    Opal.defn(self, '$throw', TMP_62 = function($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.$raise($scope.get('UncaughtThrowError').$new(args));
    }, TMP_62.$$arity = -1);

    Opal.defn(self, '$open', TMP_63 = function $$open($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_63.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_63.$$p = null;
      return ($b = ($c = $scope.get('File')).$open, $b.$$p = block.$to_proc(), $b).apply($c, Opal.to_a(args));
    }, TMP_63.$$arity = -1);
  })($scope.base);
  return (function($base, $super) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = self.$$proto, $scope = self.$$scope;

    return self.$include($scope.get('Kernel'))
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/error"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$new', '$clone', '$to_s', '$empty?', '$class', '$attr_reader', '$[]', '$>', '$length', '$inspect']);
  (function($base, $super) {
    function $Exception(){};
    var self = $Exception = $klass($base, $super, 'Exception', $Exception);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8;

    def.message = nil;
    Opal.defs(self, '$new', TMP_1 = function($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var message = (args.length > 0) ? args[0] : nil;
      var err = new self.$$alloc(message);

      if (Error.captureStackTrace) {
        Error.captureStackTrace(err);
      }

      err.name = self.$$name;
      err.$initialize.apply(err, args);
      return err;
    
    }, TMP_1.$$arity = -1);

    Opal.defs(self, '$exception', TMP_2 = function $$exception($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = self).$new.apply($b, Opal.to_a(args));
    }, TMP_2.$$arity = -1);

    Opal.defn(self, '$initialize', TMP_3 = function $$initialize($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.message = (args.length > 0) ? args[0] : nil;
    }, TMP_3.$$arity = -1);

    Opal.defn(self, '$backtrace', TMP_4 = function $$backtrace() {
      var self = this;

      
      var backtrace = self.stack;

      if (typeof(backtrace) === 'string') {
        return backtrace.split("\n").slice(0, 15);
      }
      else if (backtrace) {
        return backtrace.slice(0, 15);
      }

      return [];
    
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$exception', TMP_5 = function $$exception(str) {
      var self = this;

      if (str == null) {
        str = nil;
      }
      
      if (str === nil || self === str) {
        return self;
      }
      
      var cloned = self.$clone();
      cloned.message = str;
      return cloned;
    
    }, TMP_5.$$arity = -1);

    Opal.defn(self, '$message', TMP_6 = function $$message() {
      var self = this;

      return self.$to_s();
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_7 = function $$inspect() {
      var $a, self = this, as_str = nil;

      as_str = self.$to_s();
      if ((($a = as_str['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$class().$to_s()
        } else {
        return "#<" + (self.$class().$to_s()) + ": " + (self.$to_s()) + ">"
      };
    }, TMP_7.$$arity = 0);

    return (Opal.defn(self, '$to_s', TMP_8 = function $$to_s() {
      var $a, $b, self = this;

      return ((($a = (($b = self.message, $b !== false && $b !== nil && $b != null ?self.message.$to_s() : $b))) !== false && $a !== nil && $a != null) ? $a : self.$class().$to_s());
    }, TMP_8.$$arity = 0), nil) && 'to_s';
  })($scope.base, Error);
  (function($base, $super) {
    function $ScriptError(){};
    var self = $ScriptError = $klass($base, $super, 'ScriptError', $ScriptError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SyntaxError(){};
    var self = $SyntaxError = $klass($base, $super, 'SyntaxError', $SyntaxError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $LoadError(){};
    var self = $LoadError = $klass($base, $super, 'LoadError', $LoadError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $NotImplementedError(){};
    var self = $NotImplementedError = $klass($base, $super, 'NotImplementedError', $NotImplementedError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('ScriptError'));
  (function($base, $super) {
    function $SystemExit(){};
    var self = $SystemExit = $klass($base, $super, 'SystemExit', $SystemExit);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $NoMemoryError(){};
    var self = $NoMemoryError = $klass($base, $super, 'NoMemoryError', $NoMemoryError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SignalException(){};
    var self = $SignalException = $klass($base, $super, 'SignalException', $SignalException);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $Interrupt(){};
    var self = $Interrupt = $klass($base, $super, 'Interrupt', $Interrupt);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $SecurityError(){};
    var self = $SecurityError = $klass($base, $super, 'SecurityError', $SecurityError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $StandardError(){};
    var self = $StandardError = $klass($base, $super, 'StandardError', $StandardError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('Exception'));
  (function($base, $super) {
    function $ZeroDivisionError(){};
    var self = $ZeroDivisionError = $klass($base, $super, 'ZeroDivisionError', $ZeroDivisionError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('NameError'));
  (function($base, $super) {
    function $RuntimeError(){};
    var self = $RuntimeError = $klass($base, $super, 'RuntimeError', $RuntimeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $LocalJumpError(){};
    var self = $LocalJumpError = $klass($base, $super, 'LocalJumpError', $LocalJumpError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $TypeError(){};
    var self = $TypeError = $klass($base, $super, 'TypeError', $TypeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $ArgumentError(){};
    var self = $ArgumentError = $klass($base, $super, 'ArgumentError', $ArgumentError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $IndexError(){};
    var self = $IndexError = $klass($base, $super, 'IndexError', $IndexError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $StopIteration(){};
    var self = $StopIteration = $klass($base, $super, 'StopIteration', $StopIteration);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('IndexError'));
  (function($base, $super) {
    function $KeyError(){};
    var self = $KeyError = $klass($base, $super, 'KeyError', $KeyError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('IndexError'));
  (function($base, $super) {
    function $RangeError(){};
    var self = $RangeError = $klass($base, $super, 'RangeError', $RangeError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $FloatDomainError(){};
    var self = $FloatDomainError = $klass($base, $super, 'FloatDomainError', $FloatDomainError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('RangeError'));
  (function($base, $super) {
    function $IOError(){};
    var self = $IOError = $klass($base, $super, 'IOError', $IOError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $SystemCallError(){};
    var self = $SystemCallError = $klass($base, $super, 'SystemCallError', $SystemCallError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base) {
    var $Errno, self = $Errno = $module($base, 'Errno');

    var def = self.$$proto, $scope = self.$$scope;

    (function($base, $super) {
      function $EINVAL(){};
      var self = $EINVAL = $klass($base, $super, 'EINVAL', $EINVAL);

      var def = self.$$proto, $scope = self.$$scope, TMP_9;

      return (Opal.defs(self, '$new', TMP_9 = function() {
        var $a, $b, self = this, $iter = TMP_9.$$p, $yield = $iter || nil;

        TMP_9.$$p = null;
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'new', TMP_9, false, $EINVAL)), $a.$$p = null, $a).call($b, "Invalid argument");
      }, TMP_9.$$arity = 0), nil) && 'new'
    })($scope.base, $scope.get('SystemCallError'))
  })($scope.base);
  (function($base, $super) {
    function $UncaughtThrowError(){};
    var self = $UncaughtThrowError = $klass($base, $super, 'UncaughtThrowError', $UncaughtThrowError);

    var def = self.$$proto, $scope = self.$$scope, TMP_10;

    def.sym = nil;
    self.$attr_reader("sym", "arg");

    return (Opal.defn(self, '$initialize', TMP_10 = function $$initialize(args) {
      var $a, $b, self = this, $iter = TMP_10.$$p, $yield = $iter || nil;

      TMP_10.$$p = null;
      self.sym = args['$[]'](0);
      if ((($a = $rb_gt(args.$length(), 1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.arg = args['$[]'](1)};
      return ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_10, false)), $a.$$p = null, $a).call($b, "uncaught throw " + (self.sym.$inspect()));
    }, TMP_10.$$arity = 1), nil) && 'initialize';
  })($scope.base, $scope.get('ArgumentError'));
  (function($base, $super) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope, TMP_11;

    self.$attr_reader("name");

    return (Opal.defn(self, '$initialize', TMP_11 = function $$initialize(message, name) {
      var $a, $b, self = this, $iter = TMP_11.$$p, $yield = $iter || nil;

      if (name == null) {
        name = nil;
      }
      TMP_11.$$p = null;
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_11, false)), $a.$$p = null, $a).call($b, message);
      return self.name = name;
    }, TMP_11.$$arity = -2), nil) && 'initialize';
  })($scope.base, null);
  return (function($base, $super) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope, TMP_12;

    self.$attr_reader("args");

    return (Opal.defn(self, '$initialize', TMP_12 = function $$initialize(message, name, args) {
      var $a, $b, self = this, $iter = TMP_12.$$p, $yield = $iter || nil;

      if (name == null) {
        name = nil;
      }
      if (args == null) {
        args = [];
      }
      TMP_12.$$p = null;
      ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_12, false)), $a.$$p = null, $a).call($b, message, name);
      return self.args = args;
    }, TMP_12.$$arity = -2), nil) && 'initialize';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/constants"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.cdecl($scope, 'RUBY_PLATFORM', "opal");
  Opal.cdecl($scope, 'RUBY_ENGINE', "opal");
  Opal.cdecl($scope, 'RUBY_VERSION', "2.2.7");
  Opal.cdecl($scope, 'RUBY_ENGINE_VERSION', "0.10.5");
  Opal.cdecl($scope, 'RUBY_RELEASE_DATE', "2017-06-21");
  Opal.cdecl($scope, 'RUBY_PATCHLEVEL', 0);
  Opal.cdecl($scope, 'RUBY_REVISION', 0);
  Opal.cdecl($scope, 'RUBY_COPYRIGHT', "opal - Copyright (C) 2013-2015 Adam Beynon");
  return Opal.cdecl($scope, 'RUBY_DESCRIPTION', "opal " + ($scope.get('RUBY_ENGINE_VERSION')) + " (" + ($scope.get('RUBY_RELEASE_DATE')) + " revision " + ($scope.get('RUBY_REVISION')) + ")");
};

/* Generated by Opal 0.10.5 */
Opal.modules["opal/base"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("corelib/runtime");
  self.$require("corelib/helpers");
  self.$require("corelib/module");
  self.$require("corelib/class");
  self.$require("corelib/basic_object");
  self.$require("corelib/kernel");
  self.$require("corelib/error");
  return self.$require("corelib/constants");
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/nil"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class', '$new', '$>', '$length', '$Rational']);
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18;

    def.$$meta = self;

    Opal.defn(self, '$!', TMP_1 = function() {
      var self = this;

      return true;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$&', TMP_2 = function(other) {
      var self = this;

      return false;
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$|', TMP_3 = function(other) {
      var self = this;

      return other !== false && other !== nil;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$^', TMP_4 = function(other) {
      var self = this;

      return other !== false && other !== nil;
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$==', TMP_5 = function(other) {
      var self = this;

      return other === nil;
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$dup', TMP_6 = function $$dup() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$clone', TMP_7 = function $$clone() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_8 = function $$inspect() {
      var self = this;

      return "nil";
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$nil?', TMP_9 = function() {
      var self = this;

      return true;
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$singleton_class', TMP_10 = function $$singleton_class() {
      var self = this;

      return $scope.get('NilClass');
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$to_a', TMP_11 = function $$to_a() {
      var self = this;

      return [];
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$to_h', TMP_12 = function $$to_h() {
      var self = this;

      return Opal.hash();
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_13 = function $$to_i() {
      var self = this;

      return 0;
    }, TMP_13.$$arity = 0);

    Opal.alias(self, 'to_f', 'to_i');

    Opal.defn(self, '$to_s', TMP_14 = function $$to_s() {
      var self = this;

      return "";
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$to_c', TMP_15 = function $$to_c() {
      var self = this;

      return $scope.get('Complex').$new(0, 0);
    }, TMP_15.$$arity = 0);

    Opal.defn(self, '$rationalize', TMP_16 = function $$rationalize($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      if ((($b = $rb_gt(args.$length(), 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$raise($scope.get('ArgumentError'))};
      return self.$Rational(0, 1);
    }, TMP_16.$$arity = -1);

    Opal.defn(self, '$to_r', TMP_17 = function $$to_r() {
      var self = this;

      return self.$Rational(0, 1);
    }, TMP_17.$$arity = 0);

    return (Opal.defn(self, '$instance_variables', TMP_18 = function $$instance_variables() {
      var self = this;

      return [];
    }, TMP_18.$$arity = 0), nil) && 'instance_variables';
  })($scope.base, null);
  return Opal.cdecl($scope, 'NIL', nil);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/boolean"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class']);
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10;

    def.$$is_boolean = true;

    def.$$meta = self;

    Opal.defn(self, '$__id__', TMP_1 = function $$__id__() {
      var self = this;

      return self.valueOf() ? 2 : 0;
    }, TMP_1.$$arity = 0);

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$!', TMP_2 = function() {
      var self = this;

      return self != true;
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$&', TMP_3 = function(other) {
      var self = this;

      return (self == true) ? (other !== false && other !== nil) : false;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$|', TMP_4 = function(other) {
      var self = this;

      return (self == true) ? true : (other !== false && other !== nil);
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$^', TMP_5 = function(other) {
      var self = this;

      return (self == true) ? (other === false || other === nil) : (other !== false && other !== nil);
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$==', TMP_6 = function(other) {
      var self = this;

      return (self == true) === other.valueOf();
    }, TMP_6.$$arity = 1);

    Opal.alias(self, 'equal?', '==');

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$singleton_class', TMP_7 = function $$singleton_class() {
      var self = this;

      return $scope.get('Boolean');
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_8 = function $$to_s() {
      var self = this;

      return (self == true) ? 'true' : 'false';
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$dup', TMP_9 = function $$dup() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    }, TMP_9.$$arity = 0);

    return (Opal.defn(self, '$clone', TMP_10 = function $$clone() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    }, TMP_10.$$arity = 0), nil) && 'clone';
  })($scope.base, Boolean);
  Opal.cdecl($scope, 'TrueClass', $scope.get('Boolean'));
  Opal.cdecl($scope, 'FalseClass', $scope.get('Boolean'));
  Opal.cdecl($scope, 'TRUE', true);
  return Opal.cdecl($scope, 'FALSE', false);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/comparable"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$===', '$>', '$<', '$equal?', '$<=>', '$normalize', '$raise', '$class']);
  return (function($base) {
    var $Comparable, self = $Comparable = $module($base, 'Comparable');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7;

    Opal.defs(self, '$normalize', TMP_1 = function $$normalize(what) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](what)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return what};
      if ((($a = $rb_gt(what, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 1};
      if ((($a = $rb_lt(what, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return -1};
      return 0;
    }, TMP_1.$$arity = 1);

    Opal.defn(self, '$==', TMP_2 = function(other) {
      var $a, self = this, cmp = nil;

      try {
        if ((($a = self['$equal?'](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return true};
        
      if (self["$<=>"] == Opal.Kernel["$<=>"]) {
        return false;
      }

      // check for infinite recursion
      if (self.$$comparable) {
        delete self.$$comparable;
        return false;
      }
    
        if ((($a = cmp = (self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          return false
        };
        return $scope.get('Comparable').$normalize(cmp) == 0;
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {
          try {
            return false
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$>', TMP_3 = function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) > 0;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$>=', TMP_4 = function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) >= 0;
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$<', TMP_5 = function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) < 0;
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$<=', TMP_6 = function(other) {
      var $a, self = this, cmp = nil;

      if ((($a = cmp = (self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return $scope.get('Comparable').$normalize(cmp) <= 0;
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$between?', TMP_7 = function(min, max) {
      var self = this;

      if ($rb_lt(self, min)) {
        return false};
      if ($rb_gt(self, max)) {
        return false};
      return true;
    }, TMP_7.$$arity = 2);
  })($scope.base)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/regexp"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$nil?', '$[]', '$raise', '$escape', '$options', '$to_str', '$new', '$join', '$coerce_to!', '$!', '$match', '$coerce_to?', '$begin', '$coerce_to', '$call', '$=~', '$attr_reader', '$===', '$inspect', '$to_a']);
  (function($base, $super) {
    function $RegexpError(){};
    var self = $RegexpError = $klass($base, $super, 'RegexpError', $RegexpError);

    var def = self.$$proto, $scope = self.$$scope;

    return nil;
  })($scope.base, $scope.get('StandardError'));
  (function($base, $super) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = self.$$proto, $scope = self.$$scope, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15;

    Opal.cdecl($scope, 'IGNORECASE', 1);

    Opal.cdecl($scope, 'MULTILINE', 4);

    def.$$is_regexp = true;

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5;

      Opal.defn(self, '$allocate', TMP_1 = function $$allocate() {
        var $a, $b, self = this, $iter = TMP_1.$$p, $yield = $iter || nil, allocated = nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

        TMP_1.$$p = null;
        $zuper = [];
        
        for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
          $zuper[$zuper_index] = arguments[$zuper_index];
        }
        allocated = ($a = ($b = self, Opal.find_super_dispatcher(self, 'allocate', TMP_1, false)), $a.$$p = $iter, $a).apply($b, $zuper);
        allocated.uninitialized = true;
        return allocated;
      }, TMP_1.$$arity = 0);
      Opal.defn(self, '$escape', TMP_2 = function $$escape(string) {
        var self = this;

        
        return string.replace(/([-[\]\/{}()*+?.^$\\| ])/g, '\\$1')
                     .replace(/[\n]/g, '\\n')
                     .replace(/[\r]/g, '\\r')
                     .replace(/[\f]/g, '\\f')
                     .replace(/[\t]/g, '\\t');
      
      }, TMP_2.$$arity = 1);
      Opal.defn(self, '$last_match', TMP_3 = function $$last_match(n) {
        var $a, self = this;
        if ($gvars["~"] == null) $gvars["~"] = nil;

        if (n == null) {
          n = nil;
        }
        if ((($a = n['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return $gvars["~"]
          } else {
          return $gvars["~"]['$[]'](n)
        };
      }, TMP_3.$$arity = -1);
      Opal.alias(self, 'quote', 'escape');
      Opal.defn(self, '$union', TMP_4 = function $$union($a_rest) {
        var self = this, parts;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        parts = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          parts[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        var is_first_part_array, quoted_validated, part, options, each_part_options;
        if (parts.length == 0) {
          return /(?!)/;
        }
        // cover the 2 arrays passed as arguments case
        is_first_part_array = parts[0].$$is_array;
        if (parts.length > 1 && is_first_part_array) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of Array into String")
        }        
        // deal with splat issues (related to https://github.com/opal/opal/issues/858)
        if (is_first_part_array) {
          parts = parts[0];
        }
        options = undefined;
        quoted_validated = [];
        for (var i=0; i < parts.length; i++) {
          part = parts[i];
          if (part.$$is_string) {
            quoted_validated.push(self.$escape(part));
          }
          else if (part.$$is_regexp) {
            each_part_options = (part).$options();
            if (options != undefined && options != each_part_options) {
              self.$raise($scope.get('TypeError'), "All expressions must use the same options")
            }
            options = each_part_options;
            quoted_validated.push('('+part.source+')');
          }
          else {
            quoted_validated.push(self.$escape((part).$to_str()));
          }
        }
      
        return self.$new((quoted_validated).$join("|"), options);
      }, TMP_4.$$arity = -1);
      return (Opal.defn(self, '$new', TMP_5 = function(regexp, options) {
        var self = this;

        
        if (regexp.$$is_regexp) {
          return new RegExp(regexp);
        }

        regexp = $scope.get('Opal')['$coerce_to!'](regexp, $scope.get('String'), "to_str");

        if (regexp.charAt(regexp.length - 1) === '\\' && regexp.charAt(regexp.length - 2) !== '\\') {
          self.$raise($scope.get('RegexpError'), "too short escape sequence: /" + (regexp) + "/")
        }

        if (options === undefined || options['$!']()) {
          return new RegExp(regexp);
        }

        if (options.$$is_number) {
          var temp = '';
          if ($scope.get('IGNORECASE') & options) { temp += 'i'; }
          if ($scope.get('MULTILINE')  & options) { temp += 'm'; }
          options = temp;
        }
        else {
          options = 'i';
        }

        return new RegExp(regexp, options);
      ;
      }, TMP_5.$$arity = -2), nil) && 'new';
    })(Opal.get_singleton_class(self));

    Opal.defn(self, '$==', TMP_6 = function(other) {
      var self = this;

      return other.constructor == RegExp && self.toString() === other.toString();
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$===', TMP_7 = function(string) {
      var self = this;

      return self.$match($scope.get('Opal')['$coerce_to?'](string, $scope.get('String'), "to_str")) !== nil;
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$=~', TMP_8 = function(string) {
      var $a, self = this;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      return ($a = self.$match(string), $a !== false && $a !== nil && $a != null ?$gvars["~"].$begin(0) : $a);
    }, TMP_8.$$arity = 1);

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$inspect', TMP_9 = function $$inspect() {
      var self = this;

      return self.toString();
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$match', TMP_10 = function $$match(string, pos) {
      var self = this, $iter = TMP_10.$$p, block = $iter || nil;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      TMP_10.$$p = null;
      
      if (self.uninitialized) {
        self.$raise($scope.get('TypeError'), "uninitialized Regexp")
      }

      if (pos === undefined) {
        pos = 0;
      } else {
        pos = $scope.get('Opal').$coerce_to(pos, $scope.get('Integer'), "to_int");
      }

      if (string === nil) {
        return $gvars["~"] = nil;
      }

      string = $scope.get('Opal').$coerce_to(string, $scope.get('String'), "to_str");

      if (pos < 0) {
        pos += string.length;
        if (pos < 0) {
          return $gvars["~"] = nil;
        }
      }

      var source = self.source;
      var flags = 'g';
      // m flag + a . in Ruby will match white space, but in JS, it only matches beginning/ending of lines, so we get the equivalent here
      if (self.multiline) {
        source = source.replace('.', "[\\s\\S]");
        flags += 'm';
      }

      // global RegExp maintains state, so not using self/this
      var md, re = new RegExp(source, flags + (self.ignoreCase ? 'i' : ''));

      while (true) {
        md = re.exec(string);
        if (md === null) {
          return $gvars["~"] = nil;
        }
        if (md.index >= pos) {
          $gvars["~"] = $scope.get('MatchData').$new(re, md)
          return block === nil ? $gvars["~"] : block.$call($gvars["~"]);
        }
        re.lastIndex = md.index + 1;
      }
    ;
    }, TMP_10.$$arity = -2);

    Opal.defn(self, '$~', TMP_11 = function() {
      var self = this;
      if ($gvars._ == null) $gvars._ = nil;

      return self['$=~']($gvars._);
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$source', TMP_12 = function $$source() {
      var self = this;

      return self.source;
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$options', TMP_13 = function $$options() {
      var self = this;

      
      if (self.uninitialized) {
        self.$raise($scope.get('TypeError'), "uninitialized Regexp")
      }
      var result = 0;
      // should be supported in IE6 according to https://msdn.microsoft.com/en-us/library/7f5z26w4(v=vs.94).aspx
      if (self.multiline) {
        result |= $scope.get('MULTILINE');
      }
      if (self.ignoreCase) {
        result |= $scope.get('IGNORECASE');
      }
      return result;
    ;
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$casefold?', TMP_14 = function() {
      var self = this;

      return self.ignoreCase;
    }, TMP_14.$$arity = 0);

    Opal.alias(self, 'to_s', 'source');

    return (Opal.defs(self, '$_load', TMP_15 = function $$_load(args) {
      var $a, self = this;

      return ($a = self).$new.apply($a, Opal.to_a(args));
    }, TMP_15.$$arity = 1), nil) && '_load';
  })($scope.base, RegExp);
  return (function($base, $super) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = self.$$proto, $scope = self.$$scope, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27;

    def.matches = nil;
    self.$attr_reader("post_match", "pre_match", "regexp", "string");

    Opal.defn(self, '$initialize', TMP_16 = function $$initialize(regexp, match_groups) {
      var self = this;

      $gvars["~"] = self;
      self.regexp = regexp;
      self.begin = match_groups.index;
      self.string = match_groups.input;
      self.pre_match = match_groups.input.slice(0, match_groups.index);
      self.post_match = match_groups.input.slice(match_groups.index + match_groups[0].length);
      self.matches = [];
      
      for (var i = 0, length = match_groups.length; i < length; i++) {
        var group = match_groups[i];

        if (group == null) {
          self.matches.push(nil);
        }
        else {
          self.matches.push(group);
        }
      }
    
    }, TMP_16.$$arity = 2);

    Opal.defn(self, '$[]', TMP_17 = function($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = self.matches)['$[]'].apply($b, Opal.to_a(args));
    }, TMP_17.$$arity = -1);

    Opal.defn(self, '$offset', TMP_18 = function $$offset(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#offset only supports 0th element")
      }
      return [self.begin, self.begin + self.matches[n].length];
    ;
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$==', TMP_19 = function(other) {
      var $a, $b, $c, $d, self = this;

      if ((($a = $scope.get('MatchData')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = ($c = ($d = self.string == other.string, $d !== false && $d !== nil && $d != null ?self.regexp.toString() == other.regexp.toString() : $d), $c !== false && $c !== nil && $c != null ?self.pre_match == other.pre_match : $c), $b !== false && $b !== nil && $b != null ?self.post_match == other.post_match : $b), $a !== false && $a !== nil && $a != null ?self.begin == other.begin : $a);
    }, TMP_19.$$arity = 1);

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$begin', TMP_20 = function $$begin(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#begin only supports 0th element")
      }
      return self.begin;
    ;
    }, TMP_20.$$arity = 1);

    Opal.defn(self, '$end', TMP_21 = function $$end(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise($scope.get('ArgumentError'), "MatchData#end only supports 0th element")
      }
      return self.begin + self.matches[n].length;
    ;
    }, TMP_21.$$arity = 1);

    Opal.defn(self, '$captures', TMP_22 = function $$captures() {
      var self = this;

      return self.matches.slice(1);
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_23 = function $$inspect() {
      var self = this;

      
      var str = "#<MatchData " + (self.matches[0]).$inspect();

      for (var i = 1, length = self.matches.length; i < length; i++) {
        str += " " + i + ":" + (self.matches[i]).$inspect();
      }

      return str + ">";
    ;
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$length', TMP_24 = function $$length() {
      var self = this;

      return self.matches.length;
    }, TMP_24.$$arity = 0);

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$to_a', TMP_25 = function $$to_a() {
      var self = this;

      return self.matches;
    }, TMP_25.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_26 = function $$to_s() {
      var self = this;

      return self.matches[0];
    }, TMP_26.$$arity = 0);

    return (Opal.defn(self, '$values_at', TMP_27 = function $$values_at($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var i, a, index, values = [];

      for (i = 0; i < args.length; i++) {

        if (args[i].$$is_range) {
          a = (args[i]).$to_a();
          a.unshift(i, 1);
          Array.prototype.splice.apply(args, a);
        }

        index = $scope.get('Opal')['$coerce_to!'](args[i], $scope.get('Integer'), "to_int");

        if (index < 0) {
          index += self.matches.length;
          if (index < 0) {
            values.push(nil);
            continue;
          }
        }

        values.push(self.matches[index]);
      }

      return values;
    
    }, TMP_27.$$arity = -1), nil) && 'values_at';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/string"] = function(Opal) {
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$coerce_to', '$raise', '$===', '$format', '$to_s', '$respond_to?', '$to_str', '$<=>', '$==', '$=~', '$new', '$empty?', '$ljust', '$ceil', '$/', '$+', '$rjust', '$floor', '$to_a', '$each_char', '$to_proc', '$coerce_to!', '$copy_singleton_methods', '$initialize_clone', '$initialize_dup', '$enum_for', '$size', '$chomp', '$[]', '$to_i', '$each_line', '$class', '$match', '$captures', '$proc', '$shift', '$__send__', '$succ', '$escape']);
  self.$require("corelib/comparable");
  self.$require("corelib/regexp");
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_43, TMP_44, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_61, TMP_62, TMP_63, TMP_64, TMP_65, TMP_66, TMP_67, TMP_68;

    def.length = nil;
    self.$include($scope.get('Comparable'));

    def.$$is_string = true;

    Opal.defn(self, '$__id__', TMP_1 = function $$__id__() {
      var self = this;

      return self.toString();
    }, TMP_1.$$arity = 0);

    Opal.alias(self, 'object_id', '__id__');

    Opal.defs(self, '$try_convert', TMP_2 = function $$try_convert(what) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](what, $scope.get('String'), "to_str");
    }, TMP_2.$$arity = 1);

    Opal.defs(self, '$new', TMP_3 = function(str) {
      var self = this;

      if (str == null) {
        str = "";
      }
      str = $scope.get('Opal').$coerce_to(str, $scope.get('String'), "to_str");
      return new String(str);
    }, TMP_3.$$arity = -1);

    Opal.defn(self, '$initialize', TMP_4 = function $$initialize(str) {
      var self = this;

      
      if (str === undefined) {
        return self;
      }
    
      return self.$raise($scope.get('NotImplementedError'), "Mutable strings are not supported in Opal.");
    }, TMP_4.$$arity = -1);

    Opal.defn(self, '$%', TMP_5 = function(data) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](data)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = self).$format.apply($a, [self].concat(Opal.to_a(data)))
        } else {
        return self.$format(self, data)
      };
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$*', TMP_6 = function(count) {
      var self = this;

      
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative argument")
      }

      if (count === 0) {
        return '';
      }

      var result = '',
          string = self.toString();

      // All credit for the bit-twiddling magic code below goes to Mozilla
      // polyfill implementation of String.prototype.repeat() posted here:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat

      if (string.length * count >= 1 << 28) {
        self.$raise($scope.get('RangeError'), "multiply count must not overflow maximum string size")
      }

      for (;;) {
        if ((count & 1) === 1) {
          result += string;
        }
        count >>>= 1;
        if (count === 0) {
          break;
        }
        string += string;
      }

      return result;
    ;
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$+', TMP_7 = function(other) {
      var self = this;

      other = $scope.get('Opal').$coerce_to(other, $scope.get('String'), "to_str");
      return self + other.$to_s();
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_8 = function(other) {
      var $a, self = this;

      if ((($a = other['$respond_to?']("to_str")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_str().$to_s();
        return self > other ? 1 : (self < other ? -1 : 0);
        } else {
        
        var cmp = other['$<=>'](self);

        if (cmp === nil) {
          return nil;
        }
        else {
          return cmp > 0 ? -1 : (cmp < 0 ? 1 : 0);
        }
      ;
      };
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$==', TMP_9 = function(other) {
      var self = this;

      
      if (other.$$is_string) {
        return self.toString() === other.toString();
      }
      if ($scope.get('Opal')['$respond_to?'](other, "to_str")) {
        return other['$=='](self);
      }
      return false;
    ;
    }, TMP_9.$$arity = 1);

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, '===', '==');

    Opal.defn(self, '$=~', TMP_10 = function(other) {
      var self = this;

      
      if (other.$$is_string) {
        self.$raise($scope.get('TypeError'), "type mismatch: String given");
      }

      return other['$=~'](self);
    ;
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$[]', TMP_11 = function(index, length) {
      var self = this;

      
      var size = self.length, exclude;

      if (index.$$is_range) {
        exclude = index.exclude;
        length  = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");
        index   = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int");

        if (Math.abs(index) > size) {
          return nil;
        }

        if (index < 0) {
          index += size;
        }

        if (length < 0) {
          length += size;
        }

        if (!exclude) {
          length += 1;
        }

        length = length - index;

        if (length < 0) {
          length = 0;
        }

        return self.substr(index, length);
      }


      if (index.$$is_string) {
        if (length != null) {
          self.$raise($scope.get('TypeError'))
        }
        return self.indexOf(index) !== -1 ? index : nil;
      }


      if (index.$$is_regexp) {
        var match = self.match(index);

        if (match === null) {
          $gvars["~"] = nil
          return nil;
        }

        $gvars["~"] = $scope.get('MatchData').$new(index, match)

        if (length == null) {
          return match[0];
        }

        length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

        if (length < 0 && -length < match.length) {
          return match[length += match.length];
        }

        if (length >= 0 && length < match.length) {
          return match[length];
        }

        return nil;
      }


      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += size;
      }

      if (length == null) {
        if (index >= size || index < 0) {
          return nil;
        }
        return self.substr(index, 1);
      }

      length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

      if (length < 0) {
        return nil;
      }

      if (index > size || index < 0) {
        return nil;
      }

      return self.substr(index, length);
    
    }, TMP_11.$$arity = -2);

    Opal.alias(self, 'byteslice', '[]');

    Opal.defn(self, '$capitalize', TMP_12 = function $$capitalize() {
      var self = this;

      return self.charAt(0).toUpperCase() + self.substr(1).toLowerCase();
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$casecmp', TMP_13 = function $$casecmp(other) {
      var self = this;

      other = $scope.get('Opal').$coerce_to(other, $scope.get('String'), "to_str").$to_s();
      
      var ascii_only = /^[\x00-\x7F]*$/;
      if (ascii_only.test(self) && ascii_only.test(other)) {
        self = self.toLowerCase();
        other = other.toLowerCase();
      }
    
      return self['$<=>'](other);
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$center', TMP_14 = function $$center(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var ljustified = self.$ljust($rb_divide(($rb_plus(width, self.length)), 2).$ceil(), padstr),
          rjustified = self.$rjust($rb_divide(($rb_plus(width, self.length)), 2).$floor(), padstr);

      return rjustified + ljustified.slice(self.length);
    ;
    }, TMP_14.$$arity = -2);

    Opal.defn(self, '$chars', TMP_15 = function $$chars() {
      var $a, $b, self = this, $iter = TMP_15.$$p, block = $iter || nil;

      TMP_15.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return self.$each_char().$to_a()
      };
      return ($a = ($b = self).$each_char, $a.$$p = block.$to_proc(), $a).call($b);
    }, TMP_15.$$arity = 0);

    Opal.defn(self, '$chomp', TMP_16 = function $$chomp(separator) {
      var $a, self = this;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      if ((($a = separator === nil || self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      separator = $scope.get('Opal')['$coerce_to!'](separator, $scope.get('String'), "to_str").$to_s();
      
      if (separator === "\n") {
        return self.replace(/\r?\n?$/, '');
      }
      else if (separator === "") {
        return self.replace(/(\r?\n)+$/, '');
      }
      else if (self.length > separator.length) {
        var tail = self.substr(self.length - separator.length, separator.length);

        if (tail === separator) {
          return self.substr(0, self.length - separator.length);
        }
      }
    
      return self;
    }, TMP_16.$$arity = -1);

    Opal.defn(self, '$chop', TMP_17 = function $$chop() {
      var self = this;

      
      var length = self.length;

      if (length <= 1) {
        return "";
      }

      if (self.charAt(length - 1) === "\n" && self.charAt(length - 2) === "\r") {
        return self.substr(0, length - 2);
      }
      else {
        return self.substr(0, length - 1);
      }
    
    }, TMP_17.$$arity = 0);

    Opal.defn(self, '$chr', TMP_18 = function $$chr() {
      var self = this;

      return self.charAt(0);
    }, TMP_18.$$arity = 0);

    Opal.defn(self, '$clone', TMP_19 = function $$clone() {
      var self = this, copy = nil;

      copy = self.slice();
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$dup', TMP_20 = function $$dup() {
      var self = this, copy = nil;

      copy = self.slice();
      copy.$initialize_dup(self);
      return copy;
    }, TMP_20.$$arity = 0);

    Opal.defn(self, '$count', TMP_21 = function $$count($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        self.$raise($scope.get('ArgumentError'), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return 0;
      }
      return self.length - self.replace(new RegExp(char_class, 'g'), '').length;
    ;
    }, TMP_21.$$arity = -1);

    Opal.defn(self, '$delete', TMP_22 = function($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        self.$raise($scope.get('ArgumentError'), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp(char_class, 'g'), '');
    ;
    }, TMP_22.$$arity = -1);

    Opal.defn(self, '$downcase', TMP_23 = function $$downcase() {
      var self = this;

      return self.toLowerCase();
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$each_char', TMP_24 = function $$each_char() {
      var $a, $b, TMP_25, self = this, $iter = TMP_24.$$p, block = $iter || nil;

      TMP_24.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25), $a).call($b, "each_char")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        Opal.yield1(block, self.charAt(i));
      }
    
      return self;
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$each_line', TMP_26 = function $$each_line(separator) {
      var self = this, $iter = TMP_26.$$p, block = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_26.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      
      if (separator === nil) {
        Opal.yield1(block, self);

        return self;
      }

      separator = $scope.get('Opal').$coerce_to(separator, $scope.get('String'), "to_str")

      var a, i, n, length, chomped, trailing, splitted;

      if (separator.length === 0) {
        for (a = self.split(/(\n{2,})/), i = 0, n = a.length; i < n; i += 2) {
          if (a[i] || a[i + 1]) {
            Opal.yield1(block, (a[i] || "") + (a[i + 1] || ""));
          }
        }

        return self;
      }

      chomped  = self.$chomp(separator);
      trailing = self.length != chomped.length;
      splitted = chomped.split(separator);

      for (i = 0, length = splitted.length; i < length; i++) {
        if (i < length - 1 || trailing) {
          Opal.yield1(block, splitted[i] + separator);
        }
        else {
          Opal.yield1(block, splitted[i]);
        }
      }
    
      return self;
    }, TMP_26.$$arity = -1);

    Opal.defn(self, '$empty?', TMP_27 = function() {
      var self = this;

      return self.length === 0;
    }, TMP_27.$$arity = 0);

    Opal.defn(self, '$end_with?', TMP_28 = function($a_rest) {
      var self = this, suffixes;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      suffixes = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        suffixes[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = suffixes.length; i < length; i++) {
        var suffix = $scope.get('Opal').$coerce_to(suffixes[i], $scope.get('String'), "to_str").$to_s();

        if (self.length >= suffix.length &&
            self.substr(self.length - suffix.length, suffix.length) == suffix) {
          return true;
        }
      }
    
      return false;
    }, TMP_28.$$arity = -1);

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, 'equal?', '===');

    Opal.defn(self, '$gsub', TMP_29 = function $$gsub(pattern, replacement) {
      var self = this, $iter = TMP_29.$$p, block = $iter || nil;

      TMP_29.$$p = null;
      
      if (replacement === undefined && block === nil) {
        return self.$enum_for("gsub", pattern);
      }

      var result = '', match_data = nil, index = 0, match, _replacement;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while (true) {
        match = pattern.exec(self);

        if (match === null) {
          $gvars["~"] = nil
          result += self.slice(index);
          break;
        }

        match_data = $scope.get('MatchData').$new(pattern, match);

        if (replacement === undefined) {
          _replacement = block(match[0]);
        }
        else if (replacement.$$is_hash) {
          _replacement = (replacement)['$[]'](match[0]).$to_s();
        }
        else {
          if (!replacement.$$is_string) {
            replacement = $scope.get('Opal').$coerce_to(replacement, $scope.get('String'), "to_str");
          }
          _replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
            if (slashes.length % 2 === 0) {
              return original;
            }
            switch (command) {
            case "+":
              for (var i = match.length - 1; i > 0; i--) {
                if (match[i] !== undefined) {
                  return slashes.slice(1) + match[i];
                }
              }
              return '';
            case "&": return slashes.slice(1) + match[0];
            case "`": return slashes.slice(1) + self.slice(0, match.index);
            case "'": return slashes.slice(1) + self.slice(match.index + match[0].length);
            default:  return slashes.slice(1) + (match[command] || '');
            }
          }).replace(/\\\\/g, '\\');
        }

        if (pattern.lastIndex === match.index) {
          result += (_replacement + self.slice(index, match.index + 1))
          pattern.lastIndex += 1;
        }
        else {
          result += (self.slice(index, match.index) + _replacement)
        }
        index = pattern.lastIndex;
      }

      $gvars["~"] = match_data
      return result;
    ;
    }, TMP_29.$$arity = -2);

    Opal.defn(self, '$hash', TMP_30 = function $$hash() {
      var self = this;

      return self.toString();
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$hex', TMP_31 = function $$hex() {
      var self = this;

      return self.$to_i(16);
    }, TMP_31.$$arity = 0);

    Opal.defn(self, '$include?', TMP_32 = function(other) {
      var self = this;

      
      if (!other.$$is_string) {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('String'), "to_str")
      }
      return self.indexOf(other) !== -1;
    ;
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$index', TMP_33 = function $$index(search, offset) {
      var self = this;

      
      var index,
          match,
          regex;

      if (offset === undefined) {
        offset = 0;
      } else {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        regex = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          match = regex.exec(self);
          if (match === null) {
            $gvars["~"] = nil;
            index = -1;
            break;
          }
          if (match.index >= offset) {
            $gvars["~"] = $scope.get('MatchData').$new(regex, match)
            index = match.index;
            break;
          }
          regex.lastIndex = match.index + 1;
        }
      } else {
        search = $scope.get('Opal').$coerce_to(search, $scope.get('String'), "to_str");
        if (search.length === 0 && offset > self.length) {
          index = -1;
        } else {
          index = self.indexOf(search, offset);
        }
      }

      return index === -1 ? nil : index;
    
    }, TMP_33.$$arity = -2);

    Opal.defn(self, '$inspect', TMP_34 = function $$inspect() {
      var self = this;

      
      var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
          meta = {
            '\u0007': '\\a',
            '\u001b': '\\e',
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '\v': '\\v',
            '"' : '\\"',
            '\\': '\\\\'
          },
          escaped = self.replace(escapable, function (chr) {
            return meta[chr] || '\\u' + ('0000' + chr.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
          });
      return '"' + escaped.replace(/\#[\$\@\{]/g, '\\$&') + '"';
    
    }, TMP_34.$$arity = 0);

    Opal.defn(self, '$intern', TMP_35 = function $$intern() {
      var self = this;

      return self;
    }, TMP_35.$$arity = 0);

    Opal.defn(self, '$lines', TMP_36 = function $$lines(separator) {
      var $a, $b, self = this, $iter = TMP_36.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_36.$$p = null;
      e = ($a = ($b = self).$each_line, $a.$$p = block.$to_proc(), $a).call($b, separator);
      if (block !== false && block !== nil && block != null) {
        return self
        } else {
        return e.$to_a()
      };
    }, TMP_36.$$arity = -1);

    Opal.defn(self, '$length', TMP_37 = function $$length() {
      var self = this;

      return self.length;
    }, TMP_37.$$arity = 0);

    Opal.defn(self, '$ljust', TMP_38 = function $$ljust(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var index  = -1,
          result = "";

      width -= self.length;

      while (++index < width) {
        result += padstr;
      }

      return self + result.slice(0, width);
    
    }, TMP_38.$$arity = -2);

    Opal.defn(self, '$lstrip', TMP_39 = function $$lstrip() {
      var self = this;

      return self.replace(/^\s*/, '');
    }, TMP_39.$$arity = 0);

    Opal.defn(self, '$match', TMP_40 = function $$match(pattern, pos) {
      var $a, $b, self = this, $iter = TMP_40.$$p, block = $iter || nil;

      TMP_40.$$p = null;
      if ((($a = ((($b = $scope.get('String')['$==='](pattern)) !== false && $b !== nil && $b != null) ? $b : pattern['$respond_to?']("to_str"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        pattern = $scope.get('Regexp').$new(pattern.$to_str())};
      if ((($a = $scope.get('Regexp')['$==='](pattern)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "wrong argument type " + (pattern.$class()) + " (expected Regexp)")
      };
      return ($a = ($b = pattern).$match, $a.$$p = block.$to_proc(), $a).call($b, self, pos);
    }, TMP_40.$$arity = -2);

    Opal.defn(self, '$next', TMP_41 = function $$next() {
      var self = this;

      
      var i = self.length;
      if (i === 0) {
        return '';
      }
      var result = self;
      var first_alphanum_char_index = self.search(/[a-zA-Z0-9]/);
      var carry = false;
      var code;
      while (i--) {
        code = self.charCodeAt(i);
        if ((code >= 48 && code <= 57) ||
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122)) {
          switch (code) {
          case 57:
            carry = true;
            code = 48;
            break;
          case 90:
            carry = true;
            code = 65;
            break;
          case 122:
            carry = true;
            code = 97;
            break;
          default:
            carry = false;
            code += 1;
          }
        } else {
          if (first_alphanum_char_index === -1) {
            if (code === 255) {
              carry = true;
              code = 0;
            } else {
              carry = false;
              code += 1;
            }
          } else {
            carry = true;
          }
        }
        result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i + 1);
        if (carry && (i === 0 || i === first_alphanum_char_index)) {
          switch (code) {
          case 65:
            break;
          case 97:
            break;
          default:
            code += 1;
          }
          if (i === 0) {
            result = String.fromCharCode(code) + result;
          } else {
            result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i);
          }
          carry = false;
        }
        if (!carry) {
          break;
        }
      }
      return result;
    
    }, TMP_41.$$arity = 0);

    Opal.defn(self, '$oct', TMP_42 = function $$oct() {
      var self = this;

      
      var result,
          string = self,
          radix = 8;

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/i, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x') {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          radix = 2;
          break;
        case '0':
        case '0o':
          radix = 8;
          break;
        case '0d':
          radix = 10;
          break;
        case '0x':
          radix = 16;
          break;
        }
        return head + tail;
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    
    }, TMP_42.$$arity = 0);

    Opal.defn(self, '$ord', TMP_43 = function $$ord() {
      var self = this;

      return self.charCodeAt(0);
    }, TMP_43.$$arity = 0);

    Opal.defn(self, '$partition', TMP_44 = function $$partition(sep) {
      var self = this;

      
      var i, m;

      if (sep.$$is_regexp) {
        m = sep.exec(self);
        if (m === null) {
          i = -1;
        } else {
          $scope.get('MatchData').$new(sep, m);
          sep = m[0];
          i = m.index;
        }
      } else {
        sep = $scope.get('Opal').$coerce_to(sep, $scope.get('String'), "to_str");
        i = self.indexOf(sep);
      }

      if (i === -1) {
        return [self, '', ''];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    }, TMP_44.$$arity = 1);

    Opal.defn(self, '$reverse', TMP_45 = function $$reverse() {
      var self = this;

      return self.split('').reverse().join('');
    }, TMP_45.$$arity = 0);

    Opal.defn(self, '$rindex', TMP_46 = function $$rindex(search, offset) {
      var self = this;

      
      var i, m, r, _m;

      if (offset === undefined) {
        offset = self.length;
      } else {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        m = null;
        r = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          _m = r.exec(self);
          if (_m === null || _m.index > offset) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }
        if (m === null) {
          $gvars["~"] = nil
          i = -1;
        } else {
          $scope.get('MatchData').$new(r, m);
          i = m.index;
        }
      } else {
        search = $scope.get('Opal').$coerce_to(search, $scope.get('String'), "to_str");
        i = self.lastIndexOf(search, offset);
      }

      return i === -1 ? nil : i;
    
    }, TMP_46.$$arity = -2);

    Opal.defn(self, '$rjust', TMP_47 = function $$rjust(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      width = $scope.get('Opal').$coerce_to(width, $scope.get('Integer'), "to_int");
      padstr = $scope.get('Opal').$coerce_to(padstr, $scope.get('String'), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var chars     = Math.floor(width - self.length),
          patterns  = Math.floor(chars / padstr.length),
          result    = Array(patterns + 1).join(padstr),
          remaining = chars - result.length;

      return result + padstr.slice(0, remaining) + self;
    
    }, TMP_47.$$arity = -2);

    Opal.defn(self, '$rpartition', TMP_48 = function $$rpartition(sep) {
      var self = this;

      
      var i, m, r, _m;

      if (sep.$$is_regexp) {
        m = null;
        r = new RegExp(sep.source, 'gm' + (sep.ignoreCase ? 'i' : ''));

        while (true) {
          _m = r.exec(self);
          if (_m === null) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }

        if (m === null) {
          i = -1;
        } else {
          $scope.get('MatchData').$new(r, m);
          sep = m[0];
          i = m.index;
        }

      } else {
        sep = $scope.get('Opal').$coerce_to(sep, $scope.get('String'), "to_str");
        i = self.lastIndexOf(sep);
      }

      if (i === -1) {
        return ['', '', self];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    }, TMP_48.$$arity = 1);

    Opal.defn(self, '$rstrip', TMP_49 = function $$rstrip() {
      var self = this;

      return self.replace(/[\s\u0000]*$/, '');
    }, TMP_49.$$arity = 0);

    Opal.defn(self, '$scan', TMP_50 = function $$scan(pattern) {
      var self = this, $iter = TMP_50.$$p, block = $iter || nil;

      TMP_50.$$p = null;
      
      var result = [],
          match_data = nil,
          match;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while ((match = pattern.exec(self)) != null) {
        match_data = $scope.get('MatchData').$new(pattern, match);
        if (block === nil) {
          match.length == 1 ? result.push(match[0]) : result.push((match_data).$captures());
        } else {
          match.length == 1 ? block(match[0]) : block.call(self, (match_data).$captures());
        }
        if (pattern.lastIndex === match.index) {
          pattern.lastIndex += 1;
        }
      }

      $gvars["~"] = match_data

      return (block !== nil ? self : result);
    
    }, TMP_50.$$arity = 1);

    Opal.alias(self, 'size', 'length');

    Opal.alias(self, 'slice', '[]');

    Opal.defn(self, '$split', TMP_51 = function $$split(pattern, limit) {
      var $a, self = this;
      if ($gvars[";"] == null) $gvars[";"] = nil;

      
      if (self.length === 0) {
        return [];
      }

      if (limit === undefined) {
        limit = 0;
      } else {
        limit = $scope.get('Opal')['$coerce_to!'](limit, $scope.get('Integer'), "to_int");
        if (limit === 1) {
          return [self];
        }
      }

      if (pattern === undefined || pattern === nil) {
        pattern = ((($a = $gvars[";"]) !== false && $a !== nil && $a != null) ? $a : " ");
      }

      var result = [],
          string = self.toString(),
          index = 0,
          match,
          i;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str").$to_s();
        if (pattern === ' ') {
          pattern = /\s+/gm;
          string = string.replace(/^\s+/, '');
        } else {
          pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
        }
      }

      result = string.split(pattern);

      if (result.length === 1 && result[0] === string) {
        return result;
      }

      while ((i = result.indexOf(undefined)) !== -1) {
        result.splice(i, 1);
      }

      if (limit === 0) {
        while (result[result.length - 1] === '') {
          result.length -= 1;
        }
        return result;
      }

      match = pattern.exec(string);

      if (limit < 0) {
        if (match !== null && match[0] === '' && pattern.source.indexOf('(?=') === -1) {
          for (i = 0; i < match.length; i++) {
            result.push('');
          }
        }
        return result;
      }

      if (match !== null && match[0] === '') {
        result.splice(limit - 1, result.length - 1, result.slice(limit - 1).join(''));
        return result;
      }

      if (limit >= result.length) {
        return result;
      }

      i = 0;
      while (match !== null) {
        i++;
        index = pattern.lastIndex;
        if (i + 1 === limit) {
          break;
        }
        match = pattern.exec(string);
      }
      result.splice(limit - 1, result.length - 1, string.slice(index));
      return result;
    
    }, TMP_51.$$arity = -1);

    Opal.defn(self, '$squeeze', TMP_52 = function $$squeeze($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        return self.replace(/(.)\1+/g, '$1');
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp('(' + char_class + ')\\1+', 'g'), '$1');
    
    }, TMP_52.$$arity = -1);

    Opal.defn(self, '$start_with?', TMP_53 = function($a_rest) {
      var self = this, prefixes;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      prefixes = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        prefixes[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = prefixes.length; i < length; i++) {
        var prefix = $scope.get('Opal').$coerce_to(prefixes[i], $scope.get('String'), "to_str").$to_s();

        if (self.indexOf(prefix) === 0) {
          return true;
        }
      }

      return false;
    
    }, TMP_53.$$arity = -1);

    Opal.defn(self, '$strip', TMP_54 = function $$strip() {
      var self = this;

      return self.replace(/^\s*/, '').replace(/[\s\u0000]*$/, '');
    }, TMP_54.$$arity = 0);

    Opal.defn(self, '$sub', TMP_55 = function $$sub(pattern, replacement) {
      var self = this, $iter = TMP_55.$$p, block = $iter || nil;

      TMP_55.$$p = null;
      
      if (!pattern.$$is_regexp) {
        pattern = $scope.get('Opal').$coerce_to(pattern, $scope.get('String'), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }

      var result = pattern.exec(self);

      if (result === null) {
        $gvars["~"] = nil
        return self.toString();
      }

      $scope.get('MatchData').$new(pattern, result)

      if (replacement === undefined) {
        if (block === nil) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (1 for 2)")
        }
        return self.slice(0, result.index) + block(result[0]) + self.slice(result.index + result[0].length);
      }

      if (replacement.$$is_hash) {
        return self.slice(0, result.index) + (replacement)['$[]'](result[0]).$to_s() + self.slice(result.index + result[0].length);
      }

      replacement = $scope.get('Opal').$coerce_to(replacement, $scope.get('String'), "to_str");

      replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
        if (slashes.length % 2 === 0) {
          return original;
        }
        switch (command) {
        case "+":
          for (var i = result.length - 1; i > 0; i--) {
            if (result[i] !== undefined) {
              return slashes.slice(1) + result[i];
            }
          }
          return '';
        case "&": return slashes.slice(1) + result[0];
        case "`": return slashes.slice(1) + self.slice(0, result.index);
        case "'": return slashes.slice(1) + self.slice(result.index + result[0].length);
        default:  return slashes.slice(1) + (result[command] || '');
        }
      }).replace(/\\\\/g, '\\');

      return self.slice(0, result.index) + replacement + self.slice(result.index + result[0].length);
    ;
    }, TMP_55.$$arity = -2);

    Opal.alias(self, 'succ', 'next');

    Opal.defn(self, '$sum', TMP_56 = function $$sum(n) {
      var self = this;

      if (n == null) {
        n = 16;
      }
      
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");

      var result = 0,
          length = self.length,
          i = 0;

      for (; i < length; i++) {
        result += self.charCodeAt(i);
      }

      if (n <= 0) {
        return result;
      }

      return result & (Math.pow(2, n) - 1);
    ;
    }, TMP_56.$$arity = -1);

    Opal.defn(self, '$swapcase', TMP_57 = function $$swapcase() {
      var self = this;

      
      var str = self.replace(/([a-z]+)|([A-Z]+)/g, function($0,$1,$2) {
        return $1 ? $0.toUpperCase() : $0.toLowerCase();
      });

      if (self.constructor === String) {
        return str;
      }

      return self.$class().$new(str);
    
    }, TMP_57.$$arity = 0);

    Opal.defn(self, '$to_f', TMP_58 = function $$to_f() {
      var self = this;

      
      if (self.charAt(0) === '_') {
        return 0;
      }

      var result = parseFloat(self.replace(/_/g, ''));

      if (isNaN(result) || result == Infinity || result == -Infinity) {
        return 0;
      }
      else {
        return result;
      }
    
    }, TMP_58.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_59 = function $$to_i(base) {
      var self = this;

      if (base == null) {
        base = 10;
      }
      
      var result,
          string = self.toLowerCase(),
          radix = $scope.get('Opal').$coerce_to(base, $scope.get('Integer'), "to_int");

      if (radix === 1 || radix < 0 || radix > 36) {
        self.$raise($scope.get('ArgumentError'), "invalid radix " + (radix))
      }

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x' && (radix === 0 || radix === 16)) {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          if (radix === 0 || radix === 2) {
            radix = 2;
            return head + tail;
          }
          break;
        case '0':
        case '0o':
          if (radix === 0 || radix === 8) {
            radix = 8;
            return head + tail;
          }
          break;
        case '0d':
          if (radix === 0 || radix === 10) {
            radix = 10;
            return head + tail;
          }
          break;
        case '0x':
          if (radix === 0 || radix === 16) {
            radix = 16;
            return head + tail;
          }
          break;
        }
        return original
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    ;
    }, TMP_59.$$arity = -1);

    Opal.defn(self, '$to_proc', TMP_61 = function $$to_proc() {
      var $a, $b, TMP_60, self = this, sym = nil;

      sym = self;
      return ($a = ($b = self).$proc, $a.$$p = (TMP_60 = function($c_rest){var self = TMP_60.$$s || this, block, args, $d, $e, obj = nil;

        block = TMP_60.$$p || nil, TMP_60.$$p = null;
        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      if ((($d = args['$empty?']()) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          self.$raise($scope.get('ArgumentError'), "no receiver given")};
        obj = args.$shift();
        return ($d = ($e = obj).$__send__, $d.$$p = block.$to_proc(), $d).apply($e, [sym].concat(Opal.to_a(args)));}, TMP_60.$$s = self, TMP_60.$$arity = -1, TMP_60), $a).call($b);
    }, TMP_61.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_62 = function $$to_s() {
      var self = this;

      return self.toString();
    }, TMP_62.$$arity = 0);

    Opal.alias(self, 'to_str', 'to_s');

    Opal.alias(self, 'to_sym', 'intern');

    Opal.defn(self, '$tr', TMP_63 = function $$tr(from, to) {
      var self = this;

      from = $scope.get('Opal').$coerce_to(from, $scope.get('String'), "to_str").$to_s();
      to = $scope.get('Opal').$coerce_to(to, $scope.get('String'), "to_str").$to_s();
      
      if (from.length == 0 || from === to) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_to == null) {
              last_to = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_to.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_to = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }

      var new_str = ''
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch];
        if (inverse) {
          new_str += (sub == null ? global_sub : ch);
        }
        else {
          new_str += (sub != null ? sub : ch);
        }
      }
      return new_str;
    
    }, TMP_63.$$arity = 2);

    Opal.defn(self, '$tr_s', TMP_64 = function $$tr_s(from, to) {
      var self = this;

      from = $scope.get('Opal').$coerce_to(from, $scope.get('String'), "to_str").$to_s();
      to = $scope.get('Opal').$coerce_to(to, $scope.get('String'), "to_str").$to_s();
      
      if (from.length == 0) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_from == null) {
              last_from = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_from.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise($scope.get('ArgumentError'), "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }
      var new_str = ''
      var last_substitute = null
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch]
        if (inverse) {
          if (sub == null) {
            if (last_substitute == null) {
              new_str += global_sub;
              last_substitute = true;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
        else {
          if (sub != null) {
            if (last_substitute == null || last_substitute !== sub) {
              new_str += sub;
              last_substitute = sub;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
      }
      return new_str;
    
    }, TMP_64.$$arity = 2);

    Opal.defn(self, '$upcase', TMP_65 = function $$upcase() {
      var self = this;

      return self.toUpperCase();
    }, TMP_65.$$arity = 0);

    Opal.defn(self, '$upto', TMP_66 = function $$upto(stop, excl) {
      var self = this, $iter = TMP_66.$$p, block = $iter || nil;

      if (excl == null) {
        excl = false;
      }
      TMP_66.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("upto", stop, excl)
      };
      stop = $scope.get('Opal').$coerce_to(stop, $scope.get('String'), "to_str");
      
      var a, b, s = self.toString();

      if (s.length === 1 && stop.length === 1) {

        a = s.charCodeAt(0);
        b = stop.charCodeAt(0);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          block(String.fromCharCode(a));

          a += 1;
        }

      } else if (parseInt(s, 10).toString() === s && parseInt(stop, 10).toString() === stop) {

        a = parseInt(s, 10);
        b = parseInt(stop, 10);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          block(a.toString());

          a += 1;
        }

      } else {

        while (s.length <= stop.length && s <= stop) {
          if (excl && s === stop) {
            break;
          }

          block(s);

          s = (s).$succ();
        }

      }
      return self;
    
    }, TMP_66.$$arity = -2);

    
    function char_class_from_char_sets(sets) {
      function explode_sequences_in_character_set(set) {
        var result = '',
            i, len = set.length,
            curr_char,
            skip_next_dash,
            char_code_from,
            char_code_upto,
            char_code;
        for (i = 0; i < len; i++) {
          curr_char = set.charAt(i);
          if (curr_char === '-' && i > 0 && i < (len - 1) && !skip_next_dash) {
            char_code_from = set.charCodeAt(i - 1);
            char_code_upto = set.charCodeAt(i + 1);
            if (char_code_from > char_code_upto) {
              self.$raise($scope.get('ArgumentError'), "invalid range \"" + (char_code_from) + "-" + (char_code_upto) + "\" in string transliteration")
            }
            for (char_code = char_code_from + 1; char_code < char_code_upto + 1; char_code++) {
              result += String.fromCharCode(char_code);
            }
            skip_next_dash = true;
            i++;
          } else {
            skip_next_dash = (curr_char === '\\');
            result += curr_char;
          }
        }
        return result;
      }

      function intersection(setA, setB) {
        if (setA.length === 0) {
          return setB;
        }
        var result = '',
            i, len = setA.length,
            chr;
        for (i = 0; i < len; i++) {
          chr = setA.charAt(i);
          if (setB.indexOf(chr) !== -1) {
            result += chr;
          }
        }
        return result;
      }

      var i, len, set, neg, chr, tmp,
          pos_intersection = '',
          neg_intersection = '';

      for (i = 0, len = sets.length; i < len; i++) {
        set = $scope.get('Opal').$coerce_to(sets[i], $scope.get('String'), "to_str");
        neg = (set.charAt(0) === '^' && set.length > 1);
        set = explode_sequences_in_character_set(neg ? set.slice(1) : set);
        if (neg) {
          neg_intersection = intersection(neg_intersection, set);
        } else {
          pos_intersection = intersection(pos_intersection, set);
        }
      }

      if (pos_intersection.length > 0 && neg_intersection.length > 0) {
        tmp = '';
        for (i = 0, len = pos_intersection.length; i < len; i++) {
          chr = pos_intersection.charAt(i);
          if (neg_intersection.indexOf(chr) === -1) {
            tmp += chr;
          }
        }
        pos_intersection = tmp;
        neg_intersection = '';
      }

      if (pos_intersection.length > 0) {
        return '[' + $scope.get('Regexp').$escape(pos_intersection) + ']';
      }

      if (neg_intersection.length > 0) {
        return '[^' + $scope.get('Regexp').$escape(neg_intersection) + ']';
      }

      return null;
    }
  

    Opal.defn(self, '$instance_variables', TMP_67 = function $$instance_variables() {
      var self = this;

      return [];
    }, TMP_67.$$arity = 0);

    return (Opal.defs(self, '$_load', TMP_68 = function $$_load($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = self).$new.apply($b, Opal.to_a(args));
    }, TMP_68.$$arity = -1), nil) && '_load';
  })($scope.base, String);
  return Opal.cdecl($scope, 'Symbol', $scope.get('String'));
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/enumerable"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$each', '$destructure', '$raise', '$new', '$yield', '$dup', '$enum_for', '$enumerator_size', '$flatten', '$map', '$proc', '$==', '$nil?', '$respond_to?', '$coerce_to!', '$>', '$*', '$coerce_to', '$try_convert', '$<', '$+', '$-', '$to_enum', '$ceil', '$/', '$size', '$===', '$<<', '$[]', '$[]=', '$inspect', '$__send__', '$<=>', '$first', '$reverse', '$sort', '$to_proc', '$compare', '$call', '$to_a', '$lambda', '$sort!', '$map!', '$zip']);
  return (function($base) {
    var $Enumerable, self = $Enumerable = $module($base, 'Enumerable');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_4, TMP_7, TMP_10, TMP_12, TMP_15, TMP_19, TMP_21, TMP_23, TMP_24, TMP_25, TMP_27, TMP_29, TMP_31, TMP_33, TMP_35, TMP_36, TMP_38, TMP_43, TMP_44, TMP_45, TMP_48, TMP_49, TMP_51, TMP_52, TMP_53, TMP_54, TMP_56, TMP_57, TMP_59, TMP_61, TMP_62, TMP_65, TMP_68, TMP_70, TMP_72, TMP_74, TMP_76, TMP_78, TMP_83, TMP_84, TMP_86;

    Opal.defn(self, '$all?', TMP_1 = function() {try {

      var $a, $b, TMP_2, $c, TMP_3, self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      if ((block !== nil)) {
        ($a = ($b = self).$each, $a.$$p = (TMP_2 = function($c_rest){var self = TMP_2.$$s || this, value, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($d = Opal.yieldX(block, Opal.to_a(value))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            return nil
            } else {
            Opal.ret(false)
          }}, TMP_2.$$s = self, TMP_2.$$arity = -1, TMP_2), $a).call($b)
        } else {
        ($a = ($c = self).$each, $a.$$p = (TMP_3 = function($d_rest){var self = TMP_3.$$s || this, value, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($e = $scope.get('Opal').$destructure(value)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            return nil
            } else {
            Opal.ret(false)
          }}, TMP_3.$$s = self, TMP_3.$$arity = -1, TMP_3), $a).call($c)
      };
      return true;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$any?', TMP_4 = function() {try {

      var $a, $b, TMP_5, $c, TMP_6, self = this, $iter = TMP_4.$$p, block = $iter || nil;

      TMP_4.$$p = null;
      if ((block !== nil)) {
        ($a = ($b = self).$each, $a.$$p = (TMP_5 = function($c_rest){var self = TMP_5.$$s || this, value, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($d = Opal.yieldX(block, Opal.to_a(value))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            Opal.ret(true)
            } else {
            return nil
          }}, TMP_5.$$s = self, TMP_5.$$arity = -1, TMP_5), $a).call($b)
        } else {
        ($a = ($c = self).$each, $a.$$p = (TMP_6 = function($d_rest){var self = TMP_6.$$s || this, value, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($e = $scope.get('Opal').$destructure(value)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            Opal.ret(true)
            } else {
            return nil
          }}, TMP_6.$$s = self, TMP_6.$$arity = -1, TMP_6), $a).call($c)
      };
      return false;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$chunk', TMP_7 = function $$chunk(state) {
      var $a, $b, TMP_8, self = this, $iter = TMP_7.$$p, original_block = $iter || nil;

      TMP_7.$$p = null;
      if (original_block !== false && original_block !== nil && original_block != null) {
        } else {
        $scope.get('Kernel').$raise($scope.get('ArgumentError'), "no block given")
      };
      return ($a = ($b = Opal.get('Enumerator')).$new, $a.$$p = (TMP_8 = function(yielder){var self = TMP_8.$$s || this, $c, $d, TMP_9;
if (yielder == null) yielder = nil;
      
        var block, previous = nil, accumulate = [];

        if (state == undefined || state === nil) {
          block = original_block;
        } else {
          block = ($c = ($d = $scope.get('Proc')).$new, $c.$$p = (TMP_9 = function(val){var self = TMP_9.$$s || this;
if (val == null) val = nil;
        return original_block.$yield(val, state.$dup())}, TMP_9.$$s = self, TMP_9.$$arity = 1, TMP_9), $c).call($d)
        }

        function releaseAccumulate() {
          if (accumulate.length > 0) {
            yielder.$yield(previous, accumulate)
          }
        }

        self.$each.$$p = function(value) {
          var key = Opal.yield1(block, value);

          if (key === nil) {
            releaseAccumulate();
            accumulate = [];
            previous = nil;
          } else {
            if (previous === nil || previous === key) {
              accumulate.push(value);
            } else {
              releaseAccumulate();
              accumulate = [value];
            }

            previous = key;
          }
        }

        self.$each();

        releaseAccumulate();
      ;}, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8), $a).call($b);
    }, TMP_7.$$arity = -1);

    Opal.defn(self, '$collect', TMP_10 = function $$collect() {
      var $a, $b, TMP_11, self = this, $iter = TMP_10.$$p, block = $iter || nil;

      TMP_10.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_11 = function(){var self = TMP_11.$$s || this;

        return self.$enumerator_size()}, TMP_11.$$s = self, TMP_11.$$arity = 0, TMP_11), $a).call($b, "collect")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var value = Opal.yieldX(block, arguments);

        result.push(value);
      };

      self.$each();

      return result;
    
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$collect_concat', TMP_12 = function $$collect_concat() {
      var $a, $b, TMP_13, $c, TMP_14, self = this, $iter = TMP_12.$$p, block = $iter || nil;

      TMP_12.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_13 = function(){var self = TMP_13.$$s || this;

        return self.$enumerator_size()}, TMP_13.$$s = self, TMP_13.$$arity = 0, TMP_13), $a).call($b, "collect_concat")
      };
      return ($a = ($c = self).$map, $a.$$p = (TMP_14 = function(item){var self = TMP_14.$$s || this;
if (item == null) item = nil;
      return Opal.yield1(block, item);}, TMP_14.$$s = self, TMP_14.$$arity = 1, TMP_14), $a).call($c).$flatten(1);
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$count', TMP_15 = function $$count(object) {
      var $a, $b, TMP_16, $c, TMP_17, $d, TMP_18, self = this, $iter = TMP_15.$$p, block = $iter || nil, result = nil;

      TMP_15.$$p = null;
      result = 0;
      if ((($a = object != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        block = ($a = ($b = self).$proc, $a.$$p = (TMP_16 = function($c_rest){var self = TMP_16.$$s || this, args;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 0] = arguments[$arg_idx];
          }
        return $scope.get('Opal').$destructure(args)['$=='](object)}, TMP_16.$$s = self, TMP_16.$$arity = -1, TMP_16), $a).call($b)
      } else if ((($a = block['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        block = ($a = ($c = self).$proc, $a.$$p = (TMP_17 = function(){var self = TMP_17.$$s || this;

        return true}, TMP_17.$$s = self, TMP_17.$$arity = 0, TMP_17), $a).call($c)};
      ($a = ($d = self).$each, $a.$$p = (TMP_18 = function($e_rest){var self = TMP_18.$$s || this, args, $f;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      if ((($f = Opal.yieldX(block, args)) !== nil && $f != null && (!$f.$$is_boolean || $f == true))) {
          return result++;
          } else {
          return nil
        }}, TMP_18.$$s = self, TMP_18.$$arity = -1, TMP_18), $a).call($d);
      return result;
    }, TMP_15.$$arity = -1);

    Opal.defn(self, '$cycle', TMP_19 = function $$cycle(n) {
      var $a, $b, TMP_20, self = this, $iter = TMP_19.$$p, block = $iter || nil;

      if (n == null) {
        n = nil;
      }
      TMP_19.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_20 = function(){var self = TMP_20.$$s || this, $c;

        if (n['$=='](nil)) {
            if ((($c = self['$respond_to?']("size")) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
              return (($scope.get('Float')).$$scope.get('INFINITY'))
              } else {
              return nil
            }
            } else {
            n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
            if ((($c = $rb_gt(n, 0)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_20.$$s = self, TMP_20.$$arity = 0, TMP_20), $a).call($b, "cycle", n)
      };
      if ((($a = n['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
        if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
      };
      
      var result,
          all = [], i, length, value;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        all.push(param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }

      if (all.length === 0) {
        return nil;
      }

      if (n === nil) {
        while (true) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);
          }
        }
      }
      else {
        while (n > 1) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);
          }

          n--;
        }
      }
    
    }, TMP_19.$$arity = -1);

    Opal.defn(self, '$detect', TMP_21 = function $$detect(ifnone) {try {

      var $a, $b, TMP_22, self = this, $iter = TMP_21.$$p, block = $iter || nil;

      TMP_21.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("detect", ifnone)
      };
      ($a = ($b = self).$each, $a.$$p = (TMP_22 = function($c_rest){var self = TMP_22.$$s || this, args, $d, value = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      value = $scope.get('Opal').$destructure(args);
        if ((($d = Opal.yield1(block, value)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          Opal.ret(value)
          } else {
          return nil
        };}, TMP_22.$$s = self, TMP_22.$$arity = -1, TMP_22), $a).call($b);
      
      if (ifnone !== undefined) {
        if (typeof(ifnone) === 'function') {
          return ifnone();
        } else {
          return ifnone;
        }
      }
    
      return nil;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_21.$$arity = -1);

    Opal.defn(self, '$drop', TMP_23 = function $$drop(number) {
      var $a, self = this;

      number = $scope.get('Opal').$coerce_to(number, $scope.get('Integer'), "to_int");
      if ((($a = number < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "attempt to drop negative size")};
      
      var result  = [],
          current = 0;

      self.$each.$$p = function() {
        if (number <= current) {
          result.push($scope.get('Opal').$destructure(arguments));
        }

        current++;
      };

      self.$each()

      return result;
    
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$drop_while', TMP_24 = function $$drop_while() {
      var $a, self = this, $iter = TMP_24.$$p, block = $iter || nil;

      TMP_24.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("drop_while")
      };
      
      var result   = [],
          dropping = true;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        if (dropping) {
          var value = Opal.yield1(block, param);

          if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
            dropping = false;
            result.push(param);
          }
        }
        else {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$each_cons', TMP_25 = function $$each_cons(n) {
      var $a, $b, TMP_26, self = this, $iter = TMP_25.$$p, block = $iter || nil;

      TMP_25.$$p = null;
      if ((($a = arguments.length != 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 1)")};
      n = $scope.get('Opal').$try_convert(n, $scope.get('Integer'), "to_int");
      if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "invalid size")};
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_26 = function(){var self = TMP_26.$$s || this, $c, $d, enum_size = nil;

        enum_size = self.$enumerator_size();
          if ((($c = enum_size['$nil?']()) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return nil
          } else if ((($c = ((($d = enum_size['$=='](0)) !== false && $d !== nil && $d != null) ? $d : $rb_lt(enum_size, n))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(enum_size, n), 1)
          };}, TMP_26.$$s = self, TMP_26.$$arity = 0, TMP_26), $a).call($b, "each_cons", n)
      };
      
      var buffer = [], result = nil;

      self.$each.$$p = function() {
        var element = $scope.get('Opal').$destructure(arguments);
        buffer.push(element);
        if (buffer.length > n) {
          buffer.shift();
        }
        if (buffer.length == n) {
          Opal.yield1(block, buffer.slice(0, n));
        }
      }

      self.$each();

      return result;
    
    }, TMP_25.$$arity = 1);

    Opal.defn(self, '$each_entry', TMP_27 = function $$each_entry($a_rest) {
      var $b, $c, TMP_28, self = this, data, $iter = TMP_27.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      data = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        data[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_27.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($b = ($c = self).$to_enum, $b.$$p = (TMP_28 = function(){var self = TMP_28.$$s || this;

        return self.$enumerator_size()}, TMP_28.$$s = self, TMP_28.$$arity = 0, TMP_28), $b).apply($c, ["each_entry"].concat(Opal.to_a(data)))
      };
      
      self.$each.$$p = function() {
        var item = $scope.get('Opal').$destructure(arguments);

        Opal.yield1(block, item);
      }

      self.$each.apply(self, data);

      return self;
    ;
    }, TMP_27.$$arity = -1);

    Opal.defn(self, '$each_slice', TMP_29 = function $$each_slice(n) {
      var $a, $b, TMP_30, self = this, $iter = TMP_29.$$p, block = $iter || nil;

      TMP_29.$$p = null;
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
      if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "invalid slice size")};
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_30 = function(){var self = TMP_30.$$s || this, $c;

        if ((($c = self['$respond_to?']("size")) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return ($rb_divide(self.$size(), n)).$ceil()
            } else {
            return nil
          }}, TMP_30.$$s = self, TMP_30.$$arity = 0, TMP_30), $a).call($b, "each_slice", n)
      };
      
      var result,
          slice = []

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        slice.push(param);

        if (slice.length === n) {
          Opal.yield1(block, slice);
          slice = [];
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }

      // our "last" group, if smaller than n then won't have been yielded
      if (slice.length > 0) {
        Opal.yield1(block, slice);
      }
    ;
      return nil;
    }, TMP_29.$$arity = 1);

    Opal.defn(self, '$each_with_index', TMP_31 = function $$each_with_index($a_rest) {
      var $b, $c, TMP_32, self = this, args, $iter = TMP_31.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_31.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($b = ($c = self).$enum_for, $b.$$p = (TMP_32 = function(){var self = TMP_32.$$s || this;

        return self.$enumerator_size()}, TMP_32.$$s = self, TMP_32.$$arity = 0, TMP_32), $b).apply($c, ["each_with_index"].concat(Opal.to_a(args)))
      };
      
      var result,
          index = 0;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        block(param, index);

        index++;
      };

      self.$each.apply(self, args);

      if (result !== undefined) {
        return result;
      }
    
      return self;
    }, TMP_31.$$arity = -1);

    Opal.defn(self, '$each_with_object', TMP_33 = function $$each_with_object(object) {
      var $a, $b, TMP_34, self = this, $iter = TMP_33.$$p, block = $iter || nil;

      TMP_33.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_34 = function(){var self = TMP_34.$$s || this;

        return self.$enumerator_size()}, TMP_34.$$s = self, TMP_34.$$arity = 0, TMP_34), $a).call($b, "each_with_object", object)
      };
      
      var result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments);

        block(param, object);
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return object;
    }, TMP_33.$$arity = 1);

    Opal.defn(self, '$entries', TMP_35 = function $$entries($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var result = [];

      self.$each.$$p = function() {
        result.push($scope.get('Opal').$destructure(arguments));
      };

      self.$each.apply(self, args);

      return result;
    
    }, TMP_35.$$arity = -1);

    Opal.alias(self, 'find', 'detect');

    Opal.defn(self, '$find_all', TMP_36 = function $$find_all() {
      var $a, $b, TMP_37, self = this, $iter = TMP_36.$$p, block = $iter || nil;

      TMP_36.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_37 = function(){var self = TMP_37.$$s || this;

        return self.$enumerator_size()}, TMP_37.$$s = self, TMP_37.$$arity = 0, TMP_37), $a).call($b, "find_all")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    }, TMP_36.$$arity = 0);

    Opal.defn(self, '$find_index', TMP_38 = function $$find_index(object) {try {

      var $a, $b, TMP_39, $c, TMP_40, self = this, $iter = TMP_38.$$p, block = $iter || nil, index = nil;

      TMP_38.$$p = null;
      if ((($a = object === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$enum_for("find_index")};
      index = 0;
      if ((($a = object != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        ($a = ($b = self).$each, $a.$$p = (TMP_39 = function($c_rest){var self = TMP_39.$$s || this, value;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ($scope.get('Opal').$destructure(value)['$=='](object)) {
            Opal.ret(index)};
          return index += 1;}, TMP_39.$$s = self, TMP_39.$$arity = -1, TMP_39), $a).call($b)
        } else {
        ($a = ($c = self).$each, $a.$$p = (TMP_40 = function($d_rest){var self = TMP_40.$$s || this, value, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($e = Opal.yieldX(block, Opal.to_a(value))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            Opal.ret(index)};
          return index += 1;}, TMP_40.$$s = self, TMP_40.$$arity = -1, TMP_40), $a).call($c)
      };
      return nil;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_38.$$arity = -1);

    Opal.defn(self, '$first', TMP_43 = function $$first(number) {try {

      var $a, $b, TMP_41, $c, TMP_42, self = this, result = nil, current = nil;

      if ((($a = number === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = self).$each, $a.$$p = (TMP_41 = function(value){var self = TMP_41.$$s || this;
if (value == null) value = nil;
        Opal.ret(value)}, TMP_41.$$s = self, TMP_41.$$arity = 1, TMP_41), $a).call($b)
        } else {
        result = [];
        number = $scope.get('Opal').$coerce_to(number, $scope.get('Integer'), "to_int");
        if ((($a = number < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to take negative size")};
        if ((($a = number == 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return []};
        current = 0;
        ($a = ($c = self).$each, $a.$$p = (TMP_42 = function($d_rest){var self = TMP_42.$$s || this, args, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 0] = arguments[$arg_idx];
          }
        result.push($scope.get('Opal').$destructure(args));
          if ((($e = number <= ++current) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            Opal.ret(result)
            } else {
            return nil
          };}, TMP_42.$$s = self, TMP_42.$$arity = -1, TMP_42), $a).call($c);
        return result;
      };
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_43.$$arity = -1);

    Opal.alias(self, 'flat_map', 'collect_concat');

    Opal.defn(self, '$grep', TMP_44 = function $$grep(pattern) {
      var $a, self = this, $iter = TMP_44.$$p, block = $iter || nil;

      TMP_44.$$p = null;
      
      var result = [];

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            value = Opal.yield1(block, param);

            result.push(value);
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            result.push(param);
          }
        };
      }

      self.$each();

      return result;
    ;
    }, TMP_44.$$arity = 1);

    Opal.defn(self, '$group_by', TMP_45 = function $$group_by() {
      var $a, $b, TMP_46, $c, $d, self = this, $iter = TMP_45.$$p, block = $iter || nil, hash = nil;

      TMP_45.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_46 = function(){var self = TMP_46.$$s || this;

        return self.$enumerator_size()}, TMP_46.$$s = self, TMP_46.$$arity = 0, TMP_46), $a).call($b, "group_by")
      };
      hash = $scope.get('Hash').$new();
      
      var result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        (($a = value, $c = hash, ((($d = $c['$[]']($a)) !== false && $d !== nil && $d != null) ? $d : $c['$[]=']($a, []))))['$<<'](param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return hash;
    }, TMP_45.$$arity = 0);

    Opal.defn(self, '$include?', TMP_48 = function(obj) {try {

      var $a, $b, TMP_47, self = this;

      ($a = ($b = self).$each, $a.$$p = (TMP_47 = function($c_rest){var self = TMP_47.$$s || this, args;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      if ($scope.get('Opal').$destructure(args)['$=='](obj)) {
          Opal.ret(true)
          } else {
          return nil
        }}, TMP_47.$$s = self, TMP_47.$$arity = -1, TMP_47), $a).call($b);
      return false;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_48.$$arity = 1);

    Opal.defn(self, '$inject', TMP_49 = function $$inject(object, sym) {
      var self = this, $iter = TMP_49.$$p, block = $iter || nil;

      TMP_49.$$p = null;
      
      var result = object;

      if (block !== nil && sym === undefined) {
        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          value = Opal.yieldX(block, [result, value]);

          result = value;
        };
      }
      else {
        if (sym === undefined) {
          if (!$scope.get('Symbol')['$==='](object)) {
            self.$raise($scope.get('TypeError'), "" + (object.$inspect()) + " is not a Symbol");
          }

          sym    = object;
          result = undefined;
        }

        self.$each.$$p = function() {
          var value = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          result = (result).$__send__(sym, value);
        };
      }

      self.$each();

      return result == undefined ? nil : result;
    ;
    }, TMP_49.$$arity = -1);

    Opal.defn(self, '$lazy', TMP_51 = function $$lazy() {
      var $a, $b, TMP_50, self = this;

      return ($a = ($b = (($scope.get('Enumerator')).$$scope.get('Lazy'))).$new, $a.$$p = (TMP_50 = function(enum$, $c_rest){var self = TMP_50.$$s || this, args, $d;

        var $args_len = arguments.length, $rest_len = $args_len - 1;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 1] = arguments[$arg_idx];
        }if (enum$ == null) enum$ = nil;
      return ($d = enum$).$yield.apply($d, Opal.to_a(args))}, TMP_50.$$s = self, TMP_50.$$arity = -2, TMP_50), $a).call($b, self, self.$enumerator_size());
    }, TMP_51.$$arity = 0);

    Opal.defn(self, '$enumerator_size', TMP_52 = function $$enumerator_size() {
      var $a, self = this;

      if ((($a = self['$respond_to?']("size")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$size()
        } else {
        return nil
      };
    }, TMP_52.$$arity = 0);

    Opal.alias(self, 'map', 'collect');

    Opal.defn(self, '$max', TMP_53 = function $$max(n) {
      var $a, $b, self = this, $iter = TMP_53.$$p, block = $iter || nil;

      TMP_53.$$p = null;
      
      if (n === undefined || n === nil) {
        var result, value;

        self.$each.$$p = function() {
          var item = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = item;
            return;
          }

          if (block !== nil) {
            value = Opal.yieldX(block, [item, result]);
          } else {
            value = (item)['$<=>'](result);
          }

          if (value === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed");
          }

          if (value > 0) {
            result = item;
          }
        }

        self.$each();

        if (result === undefined) {
          return nil;
        } else {
          return result;
        }
      }
    
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
      return ($a = ($b = self).$sort, $a.$$p = block.$to_proc(), $a).call($b).$reverse().$first(n);
    }, TMP_53.$$arity = -1);

    Opal.defn(self, '$max_by', TMP_54 = function $$max_by() {
      var $a, $b, TMP_55, self = this, $iter = TMP_54.$$p, block = $iter || nil;

      TMP_54.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_55 = function(){var self = TMP_55.$$s || this;

        return self.$enumerator_size()}, TMP_55.$$s = self, TMP_55.$$arity = 0, TMP_55), $a).call($b, "max_by")
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if ((value)['$<=>'](by) > 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    }, TMP_54.$$arity = 0);

    Opal.alias(self, 'member?', 'include?');

    Opal.defn(self, '$min', TMP_56 = function $$min() {
      var self = this, $iter = TMP_56.$$p, block = $iter || nil;

      TMP_56.$$p = null;
      
      var result;

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed");
          }

          if (value < 0) {
            result = param;
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = $scope.get('Opal').$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if ($scope.get('Opal').$compare(param, result) < 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    }, TMP_56.$$arity = 0);

    Opal.defn(self, '$min_by', TMP_57 = function $$min_by() {
      var $a, $b, TMP_58, self = this, $iter = TMP_57.$$p, block = $iter || nil;

      TMP_57.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_58 = function(){var self = TMP_58.$$s || this;

        return self.$enumerator_size()}, TMP_58.$$s = self, TMP_58.$$arity = 0, TMP_58), $a).call($b, "min_by")
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if ((value)['$<=>'](by) < 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    }, TMP_57.$$arity = 0);

    Opal.defn(self, '$minmax', TMP_59 = function $$minmax() {
      var $a, $b, $c, TMP_60, self = this, $iter = TMP_59.$$p, block = $iter || nil;

      TMP_59.$$p = null;
      ((($a = block) !== false && $a !== nil && $a != null) ? $a : block = ($b = ($c = self).$proc, $b.$$p = (TMP_60 = function(a, b){var self = TMP_60.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return a['$<=>'](b)}, TMP_60.$$s = self, TMP_60.$$arity = 2, TMP_60), $b).call($c));
      
      var min = nil, max = nil, first_time = true;

      self.$each.$$p = function() {
        var element = $scope.get('Opal').$destructure(arguments);
        if (first_time) {
          min = max = element;
          first_time = false;
        } else {
          var min_cmp = block.$call(min, element);

          if (min_cmp === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed")
          } else if (min_cmp > 0) {
            min = element;
          }

          var max_cmp = block.$call(max, element);

          if (max_cmp === nil) {
            self.$raise($scope.get('ArgumentError'), "comparison failed")
          } else if (max_cmp < 0) {
            max = element;
          }
        }
      }

      self.$each();

      return [min, max];
    
    }, TMP_59.$$arity = 0);

    Opal.defn(self, '$minmax_by', TMP_61 = function $$minmax_by() {
      var self = this, $iter = TMP_61.$$p, block = $iter || nil;

      TMP_61.$$p = null;
      return self.$raise($scope.get('NotImplementedError'));
    }, TMP_61.$$arity = 0);

    Opal.defn(self, '$none?', TMP_62 = function() {try {

      var $a, $b, TMP_63, $c, TMP_64, self = this, $iter = TMP_62.$$p, block = $iter || nil;

      TMP_62.$$p = null;
      if ((block !== nil)) {
        ($a = ($b = self).$each, $a.$$p = (TMP_63 = function($c_rest){var self = TMP_63.$$s || this, value, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($d = Opal.yieldX(block, Opal.to_a(value))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            Opal.ret(false)
            } else {
            return nil
          }}, TMP_63.$$s = self, TMP_63.$$arity = -1, TMP_63), $a).call($b)
        } else {
        ($a = ($c = self).$each, $a.$$p = (TMP_64 = function($d_rest){var self = TMP_64.$$s || this, value, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($e = $scope.get('Opal').$destructure(value)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            Opal.ret(false)
            } else {
            return nil
          }}, TMP_64.$$s = self, TMP_64.$$arity = -1, TMP_64), $a).call($c)
      };
      return true;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_62.$$arity = 0);

    Opal.defn(self, '$one?', TMP_65 = function() {try {

      var $a, $b, TMP_66, $c, TMP_67, self = this, $iter = TMP_65.$$p, block = $iter || nil, count = nil;

      TMP_65.$$p = null;
      count = 0;
      if ((block !== nil)) {
        ($a = ($b = self).$each, $a.$$p = (TMP_66 = function($c_rest){var self = TMP_66.$$s || this, value, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($d = Opal.yieldX(block, Opal.to_a(value))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            count = $rb_plus(count, 1);
            if ((($d = $rb_gt(count, 1)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
              Opal.ret(false)
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_66.$$s = self, TMP_66.$$arity = -1, TMP_66), $a).call($b)
        } else {
        ($a = ($c = self).$each, $a.$$p = (TMP_67 = function($d_rest){var self = TMP_67.$$s || this, value, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($e = $scope.get('Opal').$destructure(value)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            count = $rb_plus(count, 1);
            if ((($e = $rb_gt(count, 1)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
              Opal.ret(false)
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_67.$$s = self, TMP_67.$$arity = -1, TMP_67), $a).call($c)
      };
      return count['$=='](1);
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_65.$$arity = 0);

    Opal.defn(self, '$partition', TMP_68 = function $$partition() {
      var $a, $b, TMP_69, self = this, $iter = TMP_68.$$p, block = $iter || nil;

      TMP_68.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_69 = function(){var self = TMP_69.$$s || this;

        return self.$enumerator_size()}, TMP_69.$$s = self, TMP_69.$$arity = 0, TMP_69), $a).call($b, "partition")
      };
      
      var truthy = [], falsy = [], result;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          truthy.push(param);
        }
        else {
          falsy.push(param);
        }
      };

      self.$each();

      return [truthy, falsy];
    
    }, TMP_68.$$arity = 0);

    Opal.alias(self, 'reduce', 'inject');

    Opal.defn(self, '$reject', TMP_70 = function $$reject() {
      var $a, $b, TMP_71, self = this, $iter = TMP_70.$$p, block = $iter || nil;

      TMP_70.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_71 = function(){var self = TMP_71.$$s || this;

        return self.$enumerator_size()}, TMP_71.$$s = self, TMP_71.$$arity = 0, TMP_71), $a).call($b, "reject")
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    }, TMP_70.$$arity = 0);

    Opal.defn(self, '$reverse_each', TMP_72 = function $$reverse_each() {
      var $a, $b, TMP_73, self = this, $iter = TMP_72.$$p, block = $iter || nil;

      TMP_72.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_73 = function(){var self = TMP_73.$$s || this;

        return self.$enumerator_size()}, TMP_73.$$s = self, TMP_73.$$arity = 0, TMP_73), $a).call($b, "reverse_each")
      };
      
      var result = [];

      self.$each.$$p = function() {
        result.push(arguments);
      };

      self.$each();

      for (var i = result.length - 1; i >= 0; i--) {
        Opal.yieldX(block, result[i]);
      }

      return result;
    
    }, TMP_72.$$arity = 0);

    Opal.alias(self, 'select', 'find_all');

    Opal.defn(self, '$slice_before', TMP_74 = function $$slice_before(pattern) {
      var $a, $b, TMP_75, self = this, $iter = TMP_74.$$p, block = $iter || nil;

      TMP_74.$$p = null;
      if ((($a = pattern === undefined && block === nil || arguments.length > 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 1)")};
      return ($a = ($b = $scope.get('Enumerator')).$new, $a.$$p = (TMP_75 = function(e){var self = TMP_75.$$s || this, $c;
if (e == null) e = nil;
      
        var slice = [];

        if (block !== nil) {
          if (pattern === undefined) {
            self.$each.$$p = function() {
              var param = $scope.get('Opal').$destructure(arguments),
                  value = Opal.yield1(block, param);

              if ((($c = value) !== nil && $c != null && (!$c.$$is_boolean || $c == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
          else {
            self.$each.$$p = function() {
              var param = $scope.get('Opal').$destructure(arguments),
                  value = block(param, pattern.$dup());

              if ((($c = value) !== nil && $c != null && (!$c.$$is_boolean || $c == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
        }
        else {
          self.$each.$$p = function() {
            var param = $scope.get('Opal').$destructure(arguments),
                value = pattern['$==='](param);

            if ((($c = value) !== nil && $c != null && (!$c.$$is_boolean || $c == true)) && slice.length > 0) {
              e['$<<'](slice);
              slice = [];
            }

            slice.push(param);
          };
        }

        self.$each();

        if (slice.length > 0) {
          e['$<<'](slice);
        }
      ;}, TMP_75.$$s = self, TMP_75.$$arity = 1, TMP_75), $a).call($b);
    }, TMP_74.$$arity = -1);

    Opal.defn(self, '$sort', TMP_76 = function $$sort() {
      var $a, $b, TMP_77, $c, self = this, $iter = TMP_76.$$p, block = $iter || nil, ary = nil;

      TMP_76.$$p = null;
      ary = self.$to_a();
      if ((block !== nil)) {
        } else {
        block = ($a = ($b = self).$lambda, $a.$$p = (TMP_77 = function(a, b){var self = TMP_77.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
        return a['$<=>'](b)}, TMP_77.$$s = self, TMP_77.$$arity = 2, TMP_77), $a).call($b)
      };
      return ($a = ($c = ary).$sort, $a.$$p = block.$to_proc(), $a).call($c);
    }, TMP_76.$$arity = 0);

    Opal.defn(self, '$sort_by', TMP_78 = function $$sort_by() {
      var $a, $b, TMP_79, $c, TMP_80, $d, TMP_81, $e, TMP_82, self = this, $iter = TMP_78.$$p, block = $iter || nil, dup = nil;

      TMP_78.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_79 = function(){var self = TMP_79.$$s || this;

        return self.$enumerator_size()}, TMP_79.$$s = self, TMP_79.$$arity = 0, TMP_79), $a).call($b, "sort_by")
      };
      dup = ($a = ($c = self).$map, $a.$$p = (TMP_80 = function(){var self = TMP_80.$$s || this, $yielded, arg = nil;

      arg = $scope.get('Opal').$destructure(arguments);
        ($yielded = Opal.yield1(block, arg));return [$yielded, arg];}, TMP_80.$$s = self, TMP_80.$$arity = 0, TMP_80), $a).call($c);
      ($a = ($d = dup)['$sort!'], $a.$$p = (TMP_81 = function(a, b){var self = TMP_81.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return (a[0])['$<=>'](b[0])}, TMP_81.$$s = self, TMP_81.$$arity = 2, TMP_81), $a).call($d);
      return ($a = ($e = dup)['$map!'], $a.$$p = (TMP_82 = function(i){var self = TMP_82.$$s || this;
if (i == null) i = nil;
      return i[1];}, TMP_82.$$s = self, TMP_82.$$arity = 1, TMP_82), $a).call($e);
    }, TMP_78.$$arity = 0);

    Opal.defn(self, '$take', TMP_83 = function $$take(num) {
      var self = this;

      return self.$first(num);
    }, TMP_83.$$arity = 1);

    Opal.defn(self, '$take_while', TMP_84 = function $$take_while() {try {

      var $a, $b, TMP_85, self = this, $iter = TMP_84.$$p, block = $iter || nil, result = nil;

      TMP_84.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return self.$enum_for("take_while")
      };
      result = [];
      return ($a = ($b = self).$each, $a.$$p = (TMP_85 = function($c_rest){var self = TMP_85.$$s || this, args, $d, value = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      value = $scope.get('Opal').$destructure(args);
        if ((($d = Opal.yield1(block, value)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          } else {
          Opal.ret(result)
        };
        return result.push(value);}, TMP_85.$$s = self, TMP_85.$$arity = -1, TMP_85), $a).call($b);
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_84.$$arity = 0);

    Opal.alias(self, 'to_a', 'entries');

    Opal.defn(self, '$zip', TMP_86 = function $$zip($a_rest) {
      var $b, self = this, others, $iter = TMP_86.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      others = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        others[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_86.$$p = null;
      return ($b = self.$to_a()).$zip.apply($b, Opal.to_a(others));
    }, TMP_86.$$arity = -1);
  })($scope.base)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/enumerator"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$allocate', '$new', '$to_proc', '$coerce_to', '$nil?', '$empty?', '$+', '$class', '$__send__', '$===', '$call', '$enum_for', '$size', '$destructure', '$inspect', '$[]', '$raise', '$yield', '$each', '$enumerator_size', '$respond_to?', '$try_convert', '$<', '$for']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Enumerator(){};
    var self = $Enumerator = $klass($base, $super, 'Enumerator', $Enumerator);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_7;

    def.size = def.args = def.object = def.method = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_enumerator = true;

    Opal.defs(self, '$for', TMP_1 = function(object, method, $a_rest) {
      var self = this, args, $iter = TMP_1.$$p, block = $iter || nil;

      if (method == null) {
        method = "each";
      }
      var $args_len = arguments.length, $rest_len = $args_len - 2;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 2; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 2] = arguments[$arg_idx];
      }
      TMP_1.$$p = null;
      
      var obj = self.$allocate();

      obj.object = object;
      obj.size   = block;
      obj.method = method;
      obj.args   = args;

      return obj;
    ;
    }, TMP_1.$$arity = -2);

    Opal.defn(self, '$initialize', TMP_2 = function $$initialize($a_rest) {
      var $b, $c, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      TMP_2.$$p = null;
      if (block !== false && block !== nil && block != null) {
        self.object = ($b = ($c = $scope.get('Generator')).$new, $b.$$p = block.$to_proc(), $b).call($c);
        self.method = "each";
        self.args = [];
        self.size = arguments[0] || nil;
        if ((($b = self.size) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return self.size = $scope.get('Opal').$coerce_to(self.size, $scope.get('Integer'), "to_int")
          } else {
          return nil
        };
        } else {
        self.object = arguments[0];
        self.method = arguments[1] || "each";
        self.args = $slice.call(arguments, 2);
        return self.size = nil;
      };
    }, TMP_2.$$arity = -1);

    Opal.defn(self, '$each', TMP_3 = function $$each($a_rest) {
      var $b, $c, $d, self = this, args, $iter = TMP_3.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_3.$$p = null;
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?args['$empty?']() : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return self};
      args = $rb_plus(self.args, args);
      if ((($b = block['$nil?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return ($b = self.$class()).$new.apply($b, [self.object, self.method].concat(Opal.to_a(args)))};
      return ($c = ($d = self.object).$__send__, $c.$$p = block.$to_proc(), $c).apply($d, [self.method].concat(Opal.to_a(args)));
    }, TMP_3.$$arity = -1);

    Opal.defn(self, '$size', TMP_4 = function $$size() {
      var $a, self = this;

      if ((($a = $scope.get('Proc')['$==='](self.size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = self.size).$call.apply($a, Opal.to_a(self.args))
        } else {
        return self.size
      };
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$with_index', TMP_5 = function $$with_index(offset) {
      var $a, $b, TMP_6, self = this, $iter = TMP_5.$$p, block = $iter || nil;

      if (offset == null) {
        offset = 0;
      }
      TMP_5.$$p = null;
      if (offset !== false && offset !== nil && offset != null) {
        offset = $scope.get('Opal').$coerce_to(offset, $scope.get('Integer'), "to_int")
        } else {
        offset = 0
      };
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this;

        return self.$size()}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6), $a).call($b, "with_index", offset)
      };
      
      var result, index = offset;

      self.$each.$$p = function() {
        var param = $scope.get('Opal').$destructure(arguments),
            value = block(param, index);

        index++;

        return value;
      }

      return self.$each();
    
    }, TMP_5.$$arity = -1);

    Opal.alias(self, 'with_object', 'each_with_object');

    Opal.defn(self, '$inspect', TMP_7 = function $$inspect() {
      var $a, self = this, result = nil;

      result = "#<" + (self.$class()) + ": " + (self.object.$inspect()) + ":" + (self.method);
      if ((($a = self.args['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        result = $rb_plus(result, "(" + (self.args.$inspect()['$[]']($scope.get('Range').$new(1, -2))) + ")")
      };
      return $rb_plus(result, ">");
    }, TMP_7.$$arity = 0);

    (function($base, $super) {
      function $Generator(){};
      var self = $Generator = $klass($base, $super, 'Generator', $Generator);

      var def = self.$$proto, $scope = self.$$scope, TMP_8, TMP_9;

      def.block = nil;
      self.$include($scope.get('Enumerable'));

      Opal.defn(self, '$initialize', TMP_8 = function $$initialize() {
        var self = this, $iter = TMP_8.$$p, block = $iter || nil;

        TMP_8.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('LocalJumpError'), "no block given")
        };
        return self.block = block;
      }, TMP_8.$$arity = 0);

      return (Opal.defn(self, '$each', TMP_9 = function $$each($a_rest) {
        var $b, $c, self = this, args, $iter = TMP_9.$$p, block = $iter || nil, yielder = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        TMP_9.$$p = null;
        yielder = ($b = ($c = $scope.get('Yielder')).$new, $b.$$p = block.$to_proc(), $b).call($c);
        
        try {
          args.unshift(yielder);

          Opal.yieldX(self.block, args);
        }
        catch (e) {
          if (e === $breaker) {
            return $breaker.$v;
          }
          else {
            throw e;
          }
        }
      ;
        return self;
      }, TMP_9.$$arity = -1), nil) && 'each';
    })($scope.base, null);

    (function($base, $super) {
      function $Yielder(){};
      var self = $Yielder = $klass($base, $super, 'Yielder', $Yielder);

      var def = self.$$proto, $scope = self.$$scope, TMP_10, TMP_11, TMP_12;

      def.block = nil;
      Opal.defn(self, '$initialize', TMP_10 = function $$initialize() {
        var self = this, $iter = TMP_10.$$p, block = $iter || nil;

        TMP_10.$$p = null;
        return self.block = block;
      }, TMP_10.$$arity = 0);

      Opal.defn(self, '$yield', TMP_11 = function($a_rest) {
        var self = this, values;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        values = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          values[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        var value = Opal.yieldX(self.block, values);

        if (value === $breaker) {
          throw $breaker;
        }

        return value;
      ;
      }, TMP_11.$$arity = -1);

      return (Opal.defn(self, '$<<', TMP_12 = function($a_rest) {
        var $b, self = this, values;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        values = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          values[$arg_idx - 0] = arguments[$arg_idx];
        }
        ($b = self).$yield.apply($b, Opal.to_a(values));
        return self;
      }, TMP_12.$$arity = -1), nil) && '<<';
    })($scope.base, null);

    return (function($base, $super) {
      function $Lazy(){};
      var self = $Lazy = $klass($base, $super, 'Lazy', $Lazy);

      var def = self.$$proto, $scope = self.$$scope, TMP_13, TMP_16, TMP_17, TMP_19, TMP_24, TMP_25, TMP_27, TMP_28, TMP_30, TMP_33, TMP_36, TMP_37, TMP_39;

      def.enumerator = nil;
      (function($base, $super) {
        function $StopLazyError(){};
        var self = $StopLazyError = $klass($base, $super, 'StopLazyError', $StopLazyError);

        var def = self.$$proto, $scope = self.$$scope;

        return nil;
      })($scope.base, $scope.get('Exception'));

      Opal.defn(self, '$initialize', TMP_13 = function $$initialize(object, size) {
        var $a, $b, TMP_14, self = this, $iter = TMP_13.$$p, block = $iter || nil;

        if (size == null) {
          size = nil;
        }
        TMP_13.$$p = null;
        if ((block !== nil)) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy new without a block")
        };
        self.enumerator = object;
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'initialize', TMP_13, false)), $a.$$p = (TMP_14 = function(yielder, $c_rest){var self = TMP_14.$$s || this, each_args, $d, $e, TMP_15;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          each_args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            each_args[$arg_idx - 1] = arguments[$arg_idx];
          }if (yielder == null) yielder = nil;
        try {
            return ($d = ($e = object).$each, $d.$$p = (TMP_15 = function($c_rest){var self = TMP_15.$$s || this, args;

              var $args_len = arguments.length, $rest_len = $args_len - 0;
              if ($rest_len < 0) { $rest_len = 0; }
              args = new Array($rest_len);
              for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
                args[$arg_idx - 0] = arguments[$arg_idx];
              }
            
              args.unshift(yielder);

              Opal.yieldX(block, args);
            ;}, TMP_15.$$s = self, TMP_15.$$arity = -1, TMP_15), $d).apply($e, Opal.to_a(each_args))
          } catch ($err) {
            if (Opal.rescue($err, [$scope.get('Exception')])) {
              try {
                return nil
              } finally { Opal.pop_exception() }
            } else { throw $err; }
          }}, TMP_14.$$s = self, TMP_14.$$arity = -2, TMP_14), $a).call($b, size);
      }, TMP_13.$$arity = -2);

      Opal.alias(self, 'force', 'to_a');

      Opal.defn(self, '$lazy', TMP_16 = function $$lazy() {
        var self = this;

        return self;
      }, TMP_16.$$arity = 0);

      Opal.defn(self, '$collect', TMP_17 = function $$collect() {
        var $a, $b, TMP_18, self = this, $iter = TMP_17.$$p, block = $iter || nil;

        TMP_17.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy map without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_18 = function(enum$, $c_rest){var self = TMP_18.$$s || this, args;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          enum$.$yield(value);
        }, TMP_18.$$s = self, TMP_18.$$arity = -2, TMP_18), $a).call($b, self, self.$enumerator_size());
      }, TMP_17.$$arity = 0);

      Opal.defn(self, '$collect_concat', TMP_19 = function $$collect_concat() {
        var $a, $b, TMP_20, self = this, $iter = TMP_19.$$p, block = $iter || nil;

        TMP_19.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy map without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_20 = function(enum$, $c_rest){var self = TMP_20.$$s || this, args, $d, $e, TMP_21, $f, TMP_22;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((value)['$respond_to?']("force") && (value)['$respond_to?']("each")) {
            ($d = ($e = (value)).$each, $d.$$p = (TMP_21 = function(v){var self = TMP_21.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_21.$$s = self, TMP_21.$$arity = 1, TMP_21), $d).call($e)
          }
          else {
            var array = $scope.get('Opal').$try_convert(value, $scope.get('Array'), "to_ary");

            if (array === nil) {
              enum$.$yield(value);
            }
            else {
              ($d = ($f = (value)).$each, $d.$$p = (TMP_22 = function(v){var self = TMP_22.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_22.$$s = self, TMP_22.$$arity = 1, TMP_22), $d).call($f);
            }
          }
        ;}, TMP_20.$$s = self, TMP_20.$$arity = -2, TMP_20), $a).call($b, self, nil);
      }, TMP_19.$$arity = 0);

      Opal.defn(self, '$drop', TMP_24 = function $$drop(n) {
        var $a, $b, TMP_23, self = this, current_size = nil, set_size = nil, dropped = nil;

        n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to drop negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = $scope.get('Integer')['$==='](current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        dropped = 0;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_23 = function(enum$, $c_rest){var self = TMP_23.$$s || this, args, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if ((($d = $rb_lt(dropped, n)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            return dropped = $rb_plus(dropped, 1)
            } else {
            return ($d = enum$).$yield.apply($d, Opal.to_a(args))
          }}, TMP_23.$$s = self, TMP_23.$$arity = -2, TMP_23), $a).call($b, self, set_size);
      }, TMP_24.$$arity = 1);

      Opal.defn(self, '$drop_while', TMP_25 = function $$drop_while() {
        var $a, $b, TMP_26, self = this, $iter = TMP_25.$$p, block = $iter || nil, succeeding = nil;

        TMP_25.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy drop_while without a block")
        };
        succeeding = true;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_26 = function(enum$, $c_rest){var self = TMP_26.$$s || this, args, $d, $e;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if (succeeding !== false && succeeding !== nil && succeeding != null) {
            
            var value = Opal.yieldX(block, args);

            if ((($d = value) === nil || $d == null || ($d.$$is_boolean && $d == false))) {
              succeeding = false;

              ($d = enum$).$yield.apply($d, Opal.to_a(args));
            }
          
            } else {
            return ($e = enum$).$yield.apply($e, Opal.to_a(args))
          }}, TMP_26.$$s = self, TMP_26.$$arity = -2, TMP_26), $a).call($b, self, nil);
      }, TMP_25.$$arity = 0);

      Opal.defn(self, '$enum_for', TMP_27 = function $$enum_for(method, $a_rest) {
        var $b, $c, self = this, args, $iter = TMP_27.$$p, block = $iter || nil;

        if (method == null) {
          method = "each";
        }
        var $args_len = arguments.length, $rest_len = $args_len - 1;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 1] = arguments[$arg_idx];
        }
        TMP_27.$$p = null;
        return ($b = ($c = self.$class()).$for, $b.$$p = block.$to_proc(), $b).apply($c, [self, method].concat(Opal.to_a(args)));
      }, TMP_27.$$arity = -1);

      Opal.defn(self, '$find_all', TMP_28 = function $$find_all() {
        var $a, $b, TMP_29, self = this, $iter = TMP_28.$$p, block = $iter || nil;

        TMP_28.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy select without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_29 = function(enum$, $c_rest){var self = TMP_29.$$s || this, args, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($d = value) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            ($d = enum$).$yield.apply($d, Opal.to_a(args));
          }
        ;}, TMP_29.$$s = self, TMP_29.$$arity = -2, TMP_29), $a).call($b, self, nil);
      }, TMP_28.$$arity = 0);

      Opal.alias(self, 'flat_map', 'collect_concat');

      Opal.defn(self, '$grep', TMP_30 = function $$grep(pattern) {
        var $a, $b, TMP_31, $c, TMP_32, self = this, $iter = TMP_30.$$p, block = $iter || nil;

        TMP_30.$$p = null;
        if (block !== false && block !== nil && block != null) {
          return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_31 = function(enum$, $c_rest){var self = TMP_31.$$s || this, args, $d;

            var $args_len = arguments.length, $rest_len = $args_len - 1;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 1] = arguments[$arg_idx];
            }if (enum$ == null) enum$ = nil;
          
            var param = $scope.get('Opal').$destructure(args),
                value = pattern['$==='](param);

            if ((($d = value) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
              value = Opal.yield1(block, param);

              enum$.$yield(Opal.yield1(block, param));
            }
          ;}, TMP_31.$$s = self, TMP_31.$$arity = -2, TMP_31), $a).call($b, self, nil)
          } else {
          return ($a = ($c = $scope.get('Lazy')).$new, $a.$$p = (TMP_32 = function(enum$, $d_rest){var self = TMP_32.$$s || this, args, $e;

            var $args_len = arguments.length, $rest_len = $args_len - 1;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 1] = arguments[$arg_idx];
            }if (enum$ == null) enum$ = nil;
          
            var param = $scope.get('Opal').$destructure(args),
                value = pattern['$==='](param);

            if ((($e = value) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
              enum$.$yield(param);
            }
          ;}, TMP_32.$$s = self, TMP_32.$$arity = -2, TMP_32), $a).call($c, self, nil)
        };
      }, TMP_30.$$arity = 1);

      Opal.alias(self, 'map', 'collect');

      Opal.alias(self, 'select', 'find_all');

      Opal.defn(self, '$reject', TMP_33 = function $$reject() {
        var $a, $b, TMP_34, self = this, $iter = TMP_33.$$p, block = $iter || nil;

        TMP_33.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy reject without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_34 = function(enum$, $c_rest){var self = TMP_34.$$s || this, args, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($d = value) === nil || $d == null || ($d.$$is_boolean && $d == false))) {
            ($d = enum$).$yield.apply($d, Opal.to_a(args));
          }
        ;}, TMP_34.$$s = self, TMP_34.$$arity = -2, TMP_34), $a).call($b, self, nil);
      }, TMP_33.$$arity = 0);

      Opal.defn(self, '$take', TMP_36 = function $$take(n) {
        var $a, $b, TMP_35, self = this, current_size = nil, set_size = nil, taken = nil;

        n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('ArgumentError'), "attempt to take negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = $scope.get('Integer')['$==='](current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        taken = 0;
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_35 = function(enum$, $c_rest){var self = TMP_35.$$s || this, args, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if ((($d = $rb_lt(taken, n)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            ($d = enum$).$yield.apply($d, Opal.to_a(args));
            return taken = $rb_plus(taken, 1);
            } else {
            return self.$raise($scope.get('StopLazyError'))
          }}, TMP_35.$$s = self, TMP_35.$$arity = -2, TMP_35), $a).call($b, self, set_size);
      }, TMP_36.$$arity = 1);

      Opal.defn(self, '$take_while', TMP_37 = function $$take_while() {
        var $a, $b, TMP_38, self = this, $iter = TMP_37.$$p, block = $iter || nil;

        TMP_37.$$p = null;
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise($scope.get('ArgumentError'), "tried to call lazy take_while without a block")
        };
        return ($a = ($b = $scope.get('Lazy')).$new, $a.$$p = (TMP_38 = function(enum$, $c_rest){var self = TMP_38.$$s || this, args, $d;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($d = value) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
            ($d = enum$).$yield.apply($d, Opal.to_a(args));
          }
          else {
            self.$raise($scope.get('StopLazyError'));
          }
        ;}, TMP_38.$$s = self, TMP_38.$$arity = -2, TMP_38), $a).call($b, self, nil);
      }, TMP_37.$$arity = 0);

      Opal.alias(self, 'to_enum', 'enum_for');

      return (Opal.defn(self, '$inspect', TMP_39 = function $$inspect() {
        var self = this;

        return "#<" + (self.$class()) + ": " + (self.enumerator.$inspect()) + ">";
      }, TMP_39.$$arity = 0), nil) && 'inspect';
    })($scope.base, self);
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/numeric"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$instance_of?', '$class', '$Float', '$coerce', '$===', '$raise', '$__send__', '$equal?', '$coerce_to!', '$-@', '$**', '$-', '$*', '$div', '$<', '$ceil', '$to_f', '$denominator', '$to_r', '$==', '$floor', '$/', '$%', '$Complex', '$zero?', '$numerator', '$abs', '$arg', '$round', '$to_i', '$truncate', '$>']);
  self.$require("corelib/comparable");
  return (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36;

    self.$include($scope.get('Comparable'));

    Opal.defn(self, '$coerce', TMP_1 = function $$coerce(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [other, self]};
      return [self.$Float(other), self.$Float(self)];
    }, TMP_1.$$arity = 1);

    Opal.defn(self, '$__coerced__', TMP_2 = function $$__coerced__(method, other) {
      var $a, $b, self = this, a = nil, b = nil, $case = nil;

      try {
        $b = other.$coerce(self), $a = Opal.to_ary($b), a = ($a[0] == null ? nil : $a[0]), b = ($a[1] == null ? nil : $a[1]), $b
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {
          try {
            $case = method;if ("+"['$===']($case) || "-"['$===']($case) || "*"['$===']($case) || "/"['$===']($case) || "%"['$===']($case) || "&"['$===']($case) || "|"['$===']($case) || "^"['$===']($case) || "**"['$===']($case)) {self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerce into Numeric")}else if (">"['$===']($case) || ">="['$===']($case) || "<"['$===']($case) || "<="['$===']($case) || "<=>"['$===']($case)) {self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")}
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
      return a.$__send__(method, b);
    }, TMP_2.$$arity = 2);

    Opal.defn(self, '$<=>', TMP_3 = function(other) {
      var $a, self = this;

      if ((($a = self['$equal?'](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      return nil;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$[]', TMP_4 = function(bit) {
      var self = this, min = nil, max = nil;

      bit = $scope.get('Opal')['$coerce_to!'](bit, $scope.get('Integer'), "to_int");
      min = ((2)['$**'](30))['$-@']();
      max = $rb_minus(((2)['$**'](30)), 1);
      return (bit < min || bit > max) ? 0 : (self >> bit) % 2;
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$+@', TMP_5 = function() {
      var self = this;

      return self;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$-@', TMP_6 = function() {
      var self = this;

      return $rb_minus(0, self);
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$%', TMP_7 = function(other) {
      var self = this;

      return $rb_minus(self, $rb_times(other, self.$div(other)));
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$abs', TMP_8 = function $$abs() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return self['$-@']()
        } else {
        return self
      };
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$abs2', TMP_9 = function $$abs2() {
      var self = this;

      return $rb_times(self, self);
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$angle', TMP_10 = function $$angle() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return (($scope.get('Math')).$$scope.get('PI'))
        } else {
        return 0
      };
    }, TMP_10.$$arity = 0);

    Opal.alias(self, 'arg', 'angle');

    Opal.defn(self, '$ceil', TMP_11 = function $$ceil() {
      var self = this;

      return self.$to_f().$ceil();
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$conj', TMP_12 = function $$conj() {
      var self = this;

      return self;
    }, TMP_12.$$arity = 0);

    Opal.alias(self, 'conjugate', 'conj');

    Opal.defn(self, '$denominator', TMP_13 = function $$denominator() {
      var self = this;

      return self.$to_r().$denominator();
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$div', TMP_14 = function $$div(other) {
      var self = this;

      if (other['$=='](0)) {
        self.$raise($scope.get('ZeroDivisionError'), "divided by o")};
      return ($rb_divide(self, other)).$floor();
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$divmod', TMP_15 = function $$divmod(other) {
      var self = this;

      return [self.$div(other), self['$%'](other)];
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$fdiv', TMP_16 = function $$fdiv(other) {
      var self = this;

      return $rb_divide(self.$to_f(), other);
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$floor', TMP_17 = function $$floor() {
      var self = this;

      return self.$to_f().$floor();
    }, TMP_17.$$arity = 0);

    Opal.defn(self, '$i', TMP_18 = function $$i() {
      var self = this;

      return self.$Complex(0, self);
    }, TMP_18.$$arity = 0);

    Opal.defn(self, '$imag', TMP_19 = function $$imag() {
      var self = this;

      return 0;
    }, TMP_19.$$arity = 0);

    Opal.alias(self, 'imaginary', 'imag');

    Opal.defn(self, '$integer?', TMP_20 = function() {
      var self = this;

      return false;
    }, TMP_20.$$arity = 0);

    Opal.alias(self, 'magnitude', 'abs');

    Opal.alias(self, 'modulo', '%');

    Opal.defn(self, '$nonzero?', TMP_21 = function() {
      var $a, self = this;

      if ((($a = self['$zero?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self
      };
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$numerator', TMP_22 = function $$numerator() {
      var self = this;

      return self.$to_r().$numerator();
    }, TMP_22.$$arity = 0);

    Opal.alias(self, 'phase', 'arg');

    Opal.defn(self, '$polar', TMP_23 = function $$polar() {
      var self = this;

      return [self.$abs(), self.$arg()];
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$quo', TMP_24 = function $$quo(other) {
      var self = this;

      return $rb_divide($scope.get('Opal')['$coerce_to!'](self, $scope.get('Rational'), "to_r"), other);
    }, TMP_24.$$arity = 1);

    Opal.defn(self, '$real', TMP_25 = function $$real() {
      var self = this;

      return self;
    }, TMP_25.$$arity = 0);

    Opal.defn(self, '$real?', TMP_26 = function() {
      var self = this;

      return true;
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$rect', TMP_27 = function $$rect() {
      var self = this;

      return [self, 0];
    }, TMP_27.$$arity = 0);

    Opal.alias(self, 'rectangular', 'rect');

    Opal.defn(self, '$round', TMP_28 = function $$round(digits) {
      var self = this;

      return self.$to_f().$round(digits);
    }, TMP_28.$$arity = -1);

    Opal.defn(self, '$to_c', TMP_29 = function $$to_c() {
      var self = this;

      return self.$Complex(self, 0);
    }, TMP_29.$$arity = 0);

    Opal.defn(self, '$to_int', TMP_30 = function $$to_int() {
      var self = this;

      return self.$to_i();
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$truncate', TMP_31 = function $$truncate() {
      var self = this;

      return self.$to_f().$truncate();
    }, TMP_31.$$arity = 0);

    Opal.defn(self, '$zero?', TMP_32 = function() {
      var self = this;

      return self['$=='](0);
    }, TMP_32.$$arity = 0);

    Opal.defn(self, '$positive?', TMP_33 = function() {
      var self = this;

      return $rb_gt(self, 0);
    }, TMP_33.$$arity = 0);

    Opal.defn(self, '$negative?', TMP_34 = function() {
      var self = this;

      return $rb_lt(self, 0);
    }, TMP_34.$$arity = 0);

    Opal.defn(self, '$dup', TMP_35 = function $$dup() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't dup " + (self.$class()));
    }, TMP_35.$$arity = 0);

    return (Opal.defn(self, '$clone', TMP_36 = function $$clone() {
      var self = this;

      return self.$raise($scope.get('TypeError'), "can't clone " + (self.$class()));
    }, TMP_36.$$arity = 0), nil) && 'clone';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/array"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$to_a', '$raise', '$===', '$replace', '$respond_to?', '$to_ary', '$coerce_to', '$coerce_to?', '$join', '$to_str', '$class', '$clone', '$hash', '$<=>', '$==', '$object_id', '$inspect', '$enum_for', '$coerce_to!', '$>', '$*', '$enumerator_size', '$empty?', '$size', '$eql?', '$length', '$begin', '$end', '$exclude_end?', '$flatten', '$__id__', '$[]', '$to_s', '$new', '$!', '$>=', '$**', '$delete_if', '$to_proc', '$each', '$reverse', '$rotate', '$rand', '$at', '$keep_if', '$shuffle!', '$dup', '$<', '$sort', '$sort_by', '$!=', '$times', '$[]=', '$<<', '$values', '$kind_of?', '$last', '$first', '$upto', '$reject', '$pristine']);
  self.$require("corelib/enumerable");
  self.$require("corelib/numeric");
  return (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_19, TMP_20, TMP_21, TMP_22, TMP_24, TMP_26, TMP_28, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_37, TMP_38, TMP_39, TMP_41, TMP_43, TMP_44, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55, TMP_56, TMP_58, TMP_59, TMP_60, TMP_62, TMP_64, TMP_65, TMP_66, TMP_67, TMP_68, TMP_70, TMP_72, TMP_73, TMP_74, TMP_75, TMP_77, TMP_78, TMP_79, TMP_82, TMP_83, TMP_85, TMP_87, TMP_88, TMP_89, TMP_90, TMP_91, TMP_92, TMP_93, TMP_95, TMP_96, TMP_97, TMP_98, TMP_101, TMP_102, TMP_103, TMP_104, TMP_107, TMP_108, TMP_109, TMP_111;

    def.length = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_array = true;

    
    function toArraySubclass(obj, klass) {
      if (klass.$$name === Opal.Array) {
        return obj;
      } else {
        return klass.$allocate().$replace((obj).$to_a());
      }
    }
  

    Opal.defs(self, '$[]', TMP_1 = function($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      return toArraySubclass(objects, self);
    }, TMP_1.$$arity = -1);

    Opal.defn(self, '$initialize', TMP_2 = function $$initialize(size, obj) {
      var $a, self = this, $iter = TMP_2.$$p, block = $iter || nil;

      if (size == null) {
        size = nil;
      }
      if (obj == null) {
        obj = nil;
      }
      TMP_2.$$p = null;
      if ((($a = arguments.length > 2) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..2)")};
      
      if (arguments.length === 0) {
        self.splice(0, self.length);
        return self;
      }
    
      if ((($a = arguments.length === 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $scope.get('Array')['$==='](size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$replace(size.$to_a());
          return self;
        } else if ((($a = size['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$replace(size.$to_ary());
          return self;}};
      size = $scope.get('Opal').$coerce_to(size, $scope.get('Integer'), "to_int");
      if ((($a = size < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      
      self.splice(0, self.length);
      var i, value;

      if (block === nil) {
        for (i = 0; i < size; i++) {
          self.push(obj);
        }
      }
      else {
        for (i = 0, value; i < size; i++) {
          value = block(i);
          self[i] = value;
        }
      }

      return self;
    
    }, TMP_2.$$arity = -1);

    Opal.defs(self, '$try_convert', TMP_3 = function $$try_convert(obj) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](obj, $scope.get('Array'), "to_ary");
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$&', TMP_4 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_delete(hash, item) !== undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$|', TMP_5 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      var hash = $hash2([], {}), i, length, item;

      for (i = 0, length = self.length; i < length; i++) {
        Opal.hash_put(hash, self[i], true);
      }

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      return hash.$keys();
    ;
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$*', TMP_6 = function(other) {
      var $a, self = this;

      if ((($a = other['$respond_to?']("to_str")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$join(other.$to_str())};
      other = $scope.get('Opal').$coerce_to(other, $scope.get('Integer'), "to_int");
      if ((($a = other < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative argument")};
      
      var result = [],
          converted = self.$to_a();

      for (var i = 0; i < other; i++) {
        result = result.concat(converted);
      }

      return toArraySubclass(result, self.$class());
    ;
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$+', TMP_7 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      return self.concat(other);
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$-', TMP_8 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = other.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$clone().$to_a()};
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_get(hash, item) === undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$<<', TMP_9 = function(object) {
      var self = this;

      self.push(object);
      return self;
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_10 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
      } else if ((($a = other['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_ary().$to_a()
        } else {
        return nil
      };
      
      if (self.$hash() === other.$hash()) {
        return 0;
      }

      var count = Math.min(self.length, other.length);

      for (var i = 0; i < count; i++) {
        var tmp = (self[i])['$<=>'](other[i]);

        if (tmp !== 0) {
          return tmp;
        }
      }

      return (self.length)['$<=>'](other.length);
    ;
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$==', TMP_11 = function(other) {
      var self = this;

      
      var recursed = {};

      function _eqeq(array, other) {
        var i, length, a, b;

        if (array === other)
          return true;

        if (!other.$$is_array) {
          if ($scope.get('Opal')['$respond_to?'](other, "to_ary")) {
            return (other)['$=='](array);
          } else {
            return false;
          }
        }

        if (array.constructor !== Array)
          array = (array).$to_a();
        if (other.constructor !== Array)
          other = (other).$to_a();

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$[]', TMP_12 = function(index, length) {
      var self = this;

      
      var size = self.length,
          exclude, from, to, result;

      if (index.$$is_range) {
        exclude = index.exclude;
        from    = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int");
        to      = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            return nil;
          }
        }

        if (from > size) {
          return nil;
        }

        if (to < 0) {
          to += size;

          if (to < 0) {
            return [];
          }
        }

        if (!exclude) {
          to += 1;
        }

        result = self.slice(from, to)
      }
      else {
        index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

        if (index < 0) {
          index += size;

          if (index < 0) {
            return nil;
          }
        }

        if (length === undefined) {
          if (index >= size || index < 0) {
            return nil;
          }

          return self[index];
        }
        else {
          length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

          if (length < 0 || index > size || index < 0) {
            return nil;
          }

          result = self.slice(index, index + length);
        }
      }

      return toArraySubclass(result, self.$class())
    ;
    }, TMP_12.$$arity = -2);

    Opal.defn(self, '$[]=', TMP_13 = function(index, value, extra) {
      var $a, self = this, data = nil, length = nil;

      
      var i, size = self.length;
    
      if ((($a = $scope.get('Range')['$==='](index)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $scope.get('Array')['$==='](value)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_a()
        } else if ((($a = value['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_ary().$to_a()
          } else {
          data = [value]
        };
        
        var exclude = index.exclude,
            from    = $scope.get('Opal').$coerce_to(index.begin, $scope.get('Integer'), "to_int"),
            to      = $scope.get('Opal').$coerce_to(index.end, $scope.get('Integer'), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            self.$raise($scope.get('RangeError'), "" + (index.$inspect()) + " out of range");
          }
        }

        if (to < 0) {
          to += size;
        }

        if (!exclude) {
          to += 1;
        }

        if (from > size) {
          for (i = size; i < from; i++) {
            self[i] = nil;
          }
        }

        if (to < 0) {
          self.splice.apply(self, [from, 0].concat(data));
        }
        else {
          self.splice.apply(self, [from, to - from].concat(data));
        }

        return value;
      ;
        } else {
        if ((($a = extra === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          length = 1
          } else {
          length = value;
          value = extra;
          if ((($a = $scope.get('Array')['$==='](value)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_a()
          } else if ((($a = value['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_ary().$to_a()
            } else {
            data = [value]
          };
        };
        
        var old;

        index  = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
        length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");

        if (index < 0) {
          old    = index;
          index += size;

          if (index < 0) {
            self.$raise($scope.get('IndexError'), "index " + (old) + " too small for array; minimum " + (-self.length));
          }
        }

        if (length < 0) {
          self.$raise($scope.get('IndexError'), "negative length (" + (length) + ")")
        }

        if (index > size) {
          for (i = size; i < index; i++) {
            self[i] = nil;
          }
        }

        if (extra === undefined) {
          self[index] = value;
        }
        else {
          self.splice.apply(self, [index, length].concat(data));
        }

        return value;
      
      };
    }, TMP_13.$$arity = -3);

    Opal.defn(self, '$assoc', TMP_14 = function $$assoc(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        if (item = self[i], item.length && (item[0])['$=='](object)) {
          return item;
        }
      }

      return nil;
    
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$at', TMP_15 = function $$at(index) {
      var self = this;

      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
      
      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self[index];
    
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$bsearch', TMP_16 = function $$bsearch() {
      var self = this, $iter = TMP_16.$$p, block = $iter || nil;

      TMP_16.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("bsearch")
      };
      
      var min = 0,
          max = self.length,
          mid,
          val,
          ret,
          smaller = false,
          satisfied = nil;

      while (min < max) {
        mid = min + Math.floor((max - min) / 2);
        val = self[mid];
        ret = block(val);

        if (ret === true) {
          satisfied = val;
          smaller = true;
        }
        else if (ret === false || ret === nil) {
          smaller = false;
        }
        else if (ret.$$is_number) {
          if (ret === 0) { return val; }
          smaller = (ret < 0);
        }
        else {
          self.$raise($scope.get('TypeError'), "wrong argument type " + ((ret).$class()) + " (must be numeric, true, false or nil)")
        }

        if (smaller) { max = mid; } else { min = mid + 1; }
      }

      return satisfied;
    
    }, TMP_16.$$arity = 0);

    Opal.defn(self, '$cycle', TMP_17 = function $$cycle(n) {
      var $a, $b, TMP_18, $c, self = this, $iter = TMP_17.$$p, block = $iter || nil;

      if (n == null) {
        n = nil;
      }
      TMP_17.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_18 = function(){var self = TMP_18.$$s || this, $c;

        if (n['$=='](nil)) {
            return (($scope.get('Float')).$$scope.get('INFINITY'))
            } else {
            n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
            if ((($c = $rb_gt(n, 0)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_18.$$s = self, TMP_18.$$arity = 0, TMP_18), $a).call($b, "cycle", n)
      };
      if ((($a = ((($c = self['$empty?']()) !== false && $c !== nil && $c != null) ? $c : n['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      
      var i, length, value;

      if (n === nil) {
        while (true) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);
          }
        }
      }
      else {
        n = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
        if (n <= 0) {
          return self;
        }

        while (n > 0) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);
          }

          n--;
        }
      }
    
      return self;
    }, TMP_17.$$arity = -1);

    Opal.defn(self, '$clear', TMP_19 = function $$clear() {
      var self = this;

      self.splice(0, self.length);
      return self;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$count', TMP_20 = function $$count(object) {
      var $a, $b, self = this, $iter = TMP_20.$$p, block = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      if (object == null) {
        object = nil;
      }
      TMP_20.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = object) !== false && $b !== nil && $b != null) ? $b : block)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'count', TMP_20, false)), $a.$$p = $iter, $a).apply($b, $zuper)
        } else {
        return self.$size()
      };
    }, TMP_20.$$arity = -1);

    Opal.defn(self, '$initialize_copy', TMP_21 = function $$initialize_copy(other) {
      var self = this;

      return self.$replace(other);
    }, TMP_21.$$arity = 1);

    Opal.defn(self, '$collect', TMP_22 = function $$collect() {
      var $a, $b, TMP_23, self = this, $iter = TMP_22.$$p, block = $iter || nil;

      TMP_22.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_23 = function(){var self = TMP_23.$$s || this;

        return self.$size()}, TMP_23.$$s = self, TMP_23.$$arity = 0, TMP_23), $a).call($b, "collect")
      };
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
        result.push(value);
      }

      return result;
    
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$collect!', TMP_24 = function() {
      var $a, $b, TMP_25, self = this, $iter = TMP_24.$$p, block = $iter || nil;

      TMP_24.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25), $a).call($b, "collect!")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
        self[i] = value;
      }
    
      return self;
    }, TMP_24.$$arity = 0);

    
    function binomial_coefficient(n, k) {
      if (n === k || k === 0) {
        return 1;
      }

      if (k > 0 && n > k) {
        return binomial_coefficient(n - 1, k - 1) + binomial_coefficient(n - 1, k);
      }

      return 0;
    }
  

    Opal.defn(self, '$combination', TMP_26 = function $$combination(n) {
      var $a, $b, TMP_27, self = this, $iter = TMP_26.$$p, $yield = $iter || nil, num = nil;

      TMP_26.$$p = null;
      num = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_27 = function(){var self = TMP_27.$$s || this;

        return binomial_coefficient(self.length, num);}, TMP_27.$$s = self, TMP_27.$$arity = 0, TMP_27), $a).call($b, "combination", num)
      };
      
      var i, length, stack, chosen, lev, done, next;

      if (num === 0) {
        Opal.yield1($yield, [])
      } else if (num === 1) {
        for (i = 0, length = self.length; i < length; i++) {
          Opal.yield1($yield, [self[i]])
        }
      }
      else if (num === self.length) {
        Opal.yield1($yield, self.slice())
      }
      else if (num >= 0 && num < self.length) {
        stack = [];
        for (i = 0; i <= num + 1; i++) {
          stack.push(0);
        }

        chosen = [];
        lev = 0;
        done = false;
        stack[0] = -1;

        while (!done) {
          chosen[lev] = self[stack[lev+1]];
          while (lev < num - 1) {
            lev++;
            next = stack[lev+1] = stack[lev] + 1;
            chosen[lev] = self[next];
          }
          Opal.yield1($yield, chosen.slice())
          lev++;
          do {
            done = (lev === 0);
            stack[lev]++;
            lev--;
          } while ( stack[lev+1] + num === self.length + lev + 1 );
        }
      }
    ;
      return self;
    }, TMP_26.$$arity = 1);

    Opal.defn(self, '$repeated_combination', TMP_28 = function $$repeated_combination(n) {
      var $a, $b, TMP_29, self = this, $iter = TMP_28.$$p, $yield = $iter || nil, num = nil;

      TMP_28.$$p = null;
      num = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_29 = function(){var self = TMP_29.$$s || this;

        return binomial_coefficient(self.length + num - 1, num);}, TMP_29.$$s = self, TMP_29.$$arity = 0, TMP_29), $a).call($b, "repeated_combination", num)
      };
      
      function iterate(max, from, buffer, self) {
        if (buffer.length == max) {
          var copy = buffer.slice();
          Opal.yield1($yield, copy)
          return;
        }
        for (var i = from; i < self.length; i++) {
          buffer.push(self[i]);
          iterate(max, i, buffer, self);
          buffer.pop();
        }
      }

      if (num >= 0) {
        iterate(num, 0, [], self);
      }
    
      return self;
    }, TMP_28.$$arity = 1);

    Opal.defn(self, '$compact', TMP_30 = function $$compact() {
      var self = this;

      
      var result = [];

      for (var i = 0, length = self.length, item; i < length; i++) {
        if ((item = self[i]) !== nil) {
          result.push(item);
        }
      }

      return result;
    
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$compact!', TMP_31 = function() {
      var self = this;

      
      var original = self.length;

      for (var i = 0, length = self.length; i < length; i++) {
        if (self[i] === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : self;
    
    }, TMP_31.$$arity = 0);

    Opal.defn(self, '$concat', TMP_32 = function $$concat(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      for (var i = 0, length = other.length; i < length; i++) {
        self.push(other[i]);
      }
    
      return self;
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$delete', TMP_33 = function(object) {
      var self = this, $iter = TMP_33.$$p, $yield = $iter || nil;

      TMP_33.$$p = null;
      
      var original = self.length;

      for (var i = 0, length = original; i < length; i++) {
        if ((self[i])['$=='](object)) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      if (self.length === original) {
        if (($yield !== nil)) {
          return Opal.yieldX($yield, []);
        }
        return nil;
      }
      return object;
    ;
    }, TMP_33.$$arity = 1);

    Opal.defn(self, '$delete_at', TMP_34 = function $$delete_at(index) {
      var self = this;

      
      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      var result = self[index];

      self.splice(index, 1);

      return result;
    ;
    }, TMP_34.$$arity = 1);

    Opal.defn(self, '$delete_if', TMP_35 = function $$delete_if() {
      var $a, $b, TMP_36, self = this, $iter = TMP_35.$$p, block = $iter || nil;

      TMP_35.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_36 = function(){var self = TMP_36.$$s || this;

        return self.$size()}, TMP_36.$$s = self, TMP_36.$$arity = 0, TMP_36), $a).call($b, "delete_if")
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value !== false && value !== nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    }, TMP_35.$$arity = 0);

    Opal.defn(self, '$drop', TMP_37 = function $$drop(number) {
      var self = this;

      
      if (number < 0) {
        self.$raise($scope.get('ArgumentError'))
      }

      return self.slice(number);
    ;
    }, TMP_37.$$arity = 1);

    Opal.defn(self, '$dup', TMP_38 = function $$dup() {
      var $a, $b, self = this, $iter = TMP_38.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_38.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      
      if (
        self.$$class === Opal.Array &&
        self.$allocate.$$pristine &&
        self.$copy_instance_variables.$$pristine &&
        self.$initialize_dup.$$pristine
      ) return self.slice(0);
    
      return ($a = ($b = self, Opal.find_super_dispatcher(self, 'dup', TMP_38, false)), $a.$$p = $iter, $a).apply($b, $zuper);
    }, TMP_38.$$arity = 0);

    Opal.defn(self, '$each', TMP_39 = function $$each() {
      var $a, $b, TMP_40, self = this, $iter = TMP_39.$$p, block = $iter || nil;

      TMP_39.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_40 = function(){var self = TMP_40.$$s || this;

        return self.$size()}, TMP_40.$$s = self, TMP_40.$$arity = 0, TMP_40), $a).call($b, "each")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
      }
    
      return self;
    }, TMP_39.$$arity = 0);

    Opal.defn(self, '$each_index', TMP_41 = function $$each_index() {
      var $a, $b, TMP_42, self = this, $iter = TMP_41.$$p, block = $iter || nil;

      TMP_41.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_42 = function(){var self = TMP_42.$$s || this;

        return self.$size()}, TMP_42.$$s = self, TMP_42.$$arity = 0, TMP_42), $a).call($b, "each_index")
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, i);
      }
    
      return self;
    }, TMP_41.$$arity = 0);

    Opal.defn(self, '$empty?', TMP_43 = function() {
      var self = this;

      return self.length === 0;
    }, TMP_43.$$arity = 0);

    Opal.defn(self, '$eql?', TMP_44 = function(other) {
      var self = this;

      
      var recursed = {};

      function _eql(array, other) {
        var i, length, a, b;

        if (!other.$$is_array) {
          return false;
        }

        other = other.$to_a();

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eql(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eql(self, other);
    
    }, TMP_44.$$arity = 1);

    Opal.defn(self, '$fetch', TMP_45 = function $$fetch(index, defaults) {
      var self = this, $iter = TMP_45.$$p, block = $iter || nil;

      TMP_45.$$p = null;
      
      var original = index;

      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index >= 0 && index < self.length) {
        return self[index];
      }

      if (block !== nil) {
        return block(original);
      }

      if (defaults != null) {
        return defaults;
      }

      if (self.length === 0) {
        self.$raise($scope.get('IndexError'), "index " + (original) + " outside of array bounds: 0...0")
      }
      else {
        self.$raise($scope.get('IndexError'), "index " + (original) + " outside of array bounds: -" + (self.length) + "..." + (self.length));
      }
    ;
    }, TMP_45.$$arity = -2);

    Opal.defn(self, '$fill', TMP_46 = function $$fill($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_46.$$p, block = $iter || nil, one = nil, two = nil, obj = nil, left = nil, right = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_46.$$p = null;
      
      var i, length, value;
    
      if (block !== false && block !== nil && block != null) {
        if ((($b = args.length > 2) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$length()) + " for 0..2)")};
        $c = args, $b = Opal.to_ary($c), one = ($b[0] == null ? nil : $b[0]), two = ($b[1] == null ? nil : $b[1]), $c;
        } else {
        if ((($b = args.length == 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (0 for 1..3)")
        } else if ((($b = args.length > 3) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (args.$length()) + " for 1..3)")};
        $c = args, $b = Opal.to_ary($c), obj = ($b[0] == null ? nil : $b[0]), one = ($b[1] == null ? nil : $b[1]), two = ($b[2] == null ? nil : $b[2]), $c;
      };
      if ((($b = $scope.get('Range')['$==='](one)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if (two !== false && two !== nil && two != null) {
          self.$raise($scope.get('TypeError'), "length invalid with range")};
        left = $scope.get('Opal').$coerce_to(one.$begin(), $scope.get('Integer'), "to_int");
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left += self.length;};
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise($scope.get('RangeError'), "" + (one.$inspect()) + " out of range")};
        right = $scope.get('Opal').$coerce_to(one.$end(), $scope.get('Integer'), "to_int");
        if ((($b = right < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          right += self.length;};
        if ((($b = one['$exclude_end?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          right += 1;
        };
        if ((($b = right <= left) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return self};
      } else if (one !== false && one !== nil && one != null) {
        left = $scope.get('Opal').$coerce_to(one, $scope.get('Integer'), "to_int");
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left += self.length;};
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left = 0};
        if (two !== false && two !== nil && two != null) {
          right = $scope.get('Opal').$coerce_to(two, $scope.get('Integer'), "to_int");
          if ((($b = right == 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return self};
          right += left;
          } else {
          right = self.length
        };
        } else {
        left = 0;
        right = self.length;
      };
      if ((($b = left > self.length) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        for (i = self.length; i < right; i++) {
          self[i] = nil;
        }
      ;};
      if ((($b = right > self.length) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.length = right};
      if (block !== false && block !== nil && block != null) {
        
        for (length = self.length; left < right; left++) {
          value = block(left);
          self[left] = value;
        }
      ;
        } else {
        
        for (length = self.length; left < right; left++) {
          self[left] = obj;
        }
      ;
      };
      return self;
    }, TMP_46.$$arity = -1);

    Opal.defn(self, '$first', TMP_47 = function $$first(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[0];
      }

      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative array size");
      }

      return self.slice(0, count);
    
    }, TMP_47.$$arity = -1);

    Opal.defn(self, '$flatten', TMP_48 = function $$flatten(level) {
      var self = this;

      
      function _flatten(array, level) {
        var result = [],
            i, length,
            item, ary;

        array = (array).$to_a();

        for (i = 0, length = array.length; i < length; i++) {
          item = array[i];

          if (!$scope.get('Opal')['$respond_to?'](item, "to_ary")) {
            result.push(item);
            continue;
          }

          ary = (item).$to_ary();

          if (ary === nil) {
            result.push(item);
            continue;
          }

          if (!ary.$$is_array) {
            self.$raise($scope.get('TypeError'));
          }

          if (ary === self) {
            self.$raise($scope.get('ArgumentError'));
          }

          switch (level) {
          case undefined:
            result = result.concat(_flatten(ary));
            break;
          case 0:
            result.push(ary);
            break;
          default:
            result.push.apply(result, _flatten(ary, level - 1));
          }
        }
        return result;
      }

      if (level !== undefined) {
        level = $scope.get('Opal').$coerce_to(level, $scope.get('Integer'), "to_int");
      }

      return toArraySubclass(_flatten(self, level), self.$class());
    
    }, TMP_48.$$arity = -1);

    Opal.defn(self, '$flatten!', TMP_49 = function(level) {
      var self = this;

      
      var flattened = self.$flatten(level);

      if (self.length == flattened.length) {
        for (var i = 0, length = self.length; i < length; i++) {
          if (self[i] !== flattened[i]) {
            break;
          }
        }

        if (i == length) {
          return nil;
        }
      }

      self.$replace(flattened);
    ;
      return self;
    }, TMP_49.$$arity = -1);

    Opal.defn(self, '$hash', TMP_50 = function $$hash() {
      var self = this;

      
      var top = (Opal.hash_ids == undefined),
          result = ['A'],
          hash_id = self.$object_id(),
          item, i, key;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (i = 0; i < self.length; i++) {
          item = self[i];
          result.push(item.$hash());
        }

        return result.join(',');
      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    }, TMP_50.$$arity = 0);

    Opal.defn(self, '$include?', TMP_51 = function(member) {
      var self = this;

      
      for (var i = 0, length = self.length; i < length; i++) {
        if ((self[i])['$=='](member)) {
          return true;
        }
      }

      return false;
    
    }, TMP_51.$$arity = 1);

    Opal.defn(self, '$index', TMP_52 = function $$index(object) {
      var self = this, $iter = TMP_52.$$p, block = $iter || nil;

      TMP_52.$$p = null;
      
      var i, length, value;

      if (object != null) {
        for (i = 0, length = self.length; i < length; i++) {
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = 0, length = self.length; i < length; i++) {
          value = block(self[i]);

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else {
        return self.$enum_for("index");
      }

      return nil;
    
    }, TMP_52.$$arity = -1);

    Opal.defn(self, '$insert', TMP_53 = function $$insert(index, $a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      index = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");

      if (objects.length > 0) {
        if (index < 0) {
          index += self.length + 1;

          if (index < 0) {
            self.$raise($scope.get('IndexError'), "" + (index) + " is out of bounds");
          }
        }
        if (index > self.length) {
          for (var i = self.length; i < index; i++) {
            self.push(nil);
          }
        }

        self.splice.apply(self, [index, 0].concat(objects));
      }
    ;
      return self;
    }, TMP_53.$$arity = -2);

    Opal.defn(self, '$inspect', TMP_54 = function $$inspect() {
      var self = this;

      
      var result = [],
          id     = self.$__id__();

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self['$[]'](i);

        if ((item).$__id__() === id) {
          result.push('[...]');
        }
        else {
          result.push((item).$inspect());
        }
      }

      return '[' + result.join(', ') + ']';
    ;
    }, TMP_54.$$arity = 0);

    Opal.defn(self, '$join', TMP_55 = function $$join(sep) {
      var $a, self = this;
      if ($gvars[","] == null) $gvars[","] = nil;

      if (sep == null) {
        sep = nil;
      }
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      if ((($a = sep === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        sep = $gvars[","]};
      
      var result = [];
      var i, length, item, tmp;

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];

        if ($scope.get('Opal')['$respond_to?'](item, "to_str")) {
          tmp = (item).$to_str();

          if (tmp !== nil) {
            result.push((tmp).$to_s());

            continue;
          }
        }

        if ($scope.get('Opal')['$respond_to?'](item, "to_ary")) {
          tmp = (item).$to_ary();

          if (tmp === self) {
            self.$raise($scope.get('ArgumentError'));
          }

          if (tmp !== nil) {
            result.push((tmp).$join(sep));

            continue;
          }
        }

        if ($scope.get('Opal')['$respond_to?'](item, "to_s")) {
          tmp = (item).$to_s();

          if (tmp !== nil) {
            result.push(tmp);

            continue;
          }
        }

        self.$raise($scope.get('NoMethodError').$new("" + ($scope.get('Opal').$inspect(item)) + " doesn't respond to #to_str, #to_ary or #to_s", "to_str"));
      }

      if (sep === nil) {
        return result.join('');
      }
      else {
        return result.join($scope.get('Opal')['$coerce_to!'](sep, $scope.get('String'), "to_str").$to_s());
      }
    ;
    }, TMP_55.$$arity = -1);

    Opal.defn(self, '$keep_if', TMP_56 = function $$keep_if() {
      var $a, $b, TMP_57, self = this, $iter = TMP_56.$$p, block = $iter || nil;

      TMP_56.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_57 = function(){var self = TMP_57.$$s || this;

        return self.$size()}, TMP_57.$$s = self, TMP_57.$$arity = 0, TMP_57), $a).call($b, "keep_if")
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value === false || value === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    }, TMP_56.$$arity = 0);

    Opal.defn(self, '$last', TMP_58 = function $$last(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[self.length - 1];
      }

      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");

      if (count < 0) {
        self.$raise($scope.get('ArgumentError'), "negative array size");
      }

      if (count > self.length) {
        count = self.length;
      }

      return self.slice(self.length - count, self.length);
    
    }, TMP_58.$$arity = -1);

    Opal.defn(self, '$length', TMP_59 = function $$length() {
      var self = this;

      return self.length;
    }, TMP_59.$$arity = 0);

    Opal.alias(self, 'map', 'collect');

    Opal.alias(self, 'map!', 'collect!');

    
    // Returns the product of from, from-1, ..., from - how_many + 1.
    function descending_factorial(from, how_many) {
      var count = how_many >= 0 ? 1 : 0;
      while (how_many) {
        count *= from;
        from--;
        how_many--;
      }
      return count;
    }
  

    Opal.defn(self, '$permutation', TMP_60 = function $$permutation(num) {
      var $a, $b, TMP_61, self = this, $iter = TMP_60.$$p, block = $iter || nil, perm = nil, used = nil;

      TMP_60.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_61 = function(){var self = TMP_61.$$s || this;

        return descending_factorial(self.length, num === undefined ? self.length : num);}, TMP_61.$$s = self, TMP_61.$$arity = 0, TMP_61), $a).call($b, "permutation", num)
      };
      
      var permute, offensive, output;

      if (num === undefined) {
        num = self.length;
      }
      else {
        num = $scope.get('Opal').$coerce_to(num, $scope.get('Integer'), "to_int")
      }

      if (num < 0 || self.length < num) {
        // no permutations, yield nothing
      }
      else if (num === 0) {
        // exactly one permutation: the zero-length array
        Opal.yield1(block, [])
      }
      else if (num === 1) {
        // this is a special, easy case
        for (var i = 0; i < self.length; i++) {
          Opal.yield1(block, [self[i]])
        }
      }
      else {
        // this is the general case
        perm = $scope.get('Array').$new(num)
        used = $scope.get('Array').$new(self.length, false)

        permute = function(num, perm, index, used, blk) {
          self = this;
          for(var i = 0; i < self.length; i++){
            if(used['$[]'](i)['$!']()) {
              perm[index] = i;
              if(index < num - 1) {
                used[i] = true;
                permute.call(self, num, perm, index + 1, used, blk);
                used[i] = false;
              }
              else {
                output = [];
                for (var j = 0; j < perm.length; j++) {
                  output.push(self[perm[j]]);
                }
                Opal.yield1(blk, output);
              }
            }
          }
        }

        if ((block !== nil)) {
          // offensive (both definitions) copy.
          offensive = self.slice();
          permute.call(offensive, num, perm, 0, used, block);
        }
        else {
          permute.call(self, num, perm, 0, used, block);
        }
      }
    ;
      return self;
    }, TMP_60.$$arity = -1);

    Opal.defn(self, '$repeated_permutation', TMP_62 = function $$repeated_permutation(n) {
      var $a, $b, TMP_63, self = this, $iter = TMP_62.$$p, $yield = $iter || nil, num = nil;

      TMP_62.$$p = null;
      num = $scope.get('Opal')['$coerce_to!'](n, $scope.get('Integer'), "to_int");
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_63 = function(){var self = TMP_63.$$s || this, $c;

        if ((($c = $rb_ge(num, 0)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return self.$size()['$**'](num)
            } else {
            return 0
          }}, TMP_63.$$s = self, TMP_63.$$arity = 0, TMP_63), $a).call($b, "repeated_permutation", num)
      };
      
      function iterate(max, buffer, self) {
        if (buffer.length == max) {
          var copy = buffer.slice();
          Opal.yield1($yield, copy)
          return;
        }
        for (var i = 0; i < self.length; i++) {
          buffer.push(self[i]);
          iterate(max, buffer, self);
          buffer.pop();
        }
      }

      iterate(num, [], self.slice());
    
      return self;
    }, TMP_62.$$arity = 1);

    Opal.defn(self, '$pop', TMP_64 = function $$pop(count) {
      var $a, self = this;

      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.pop();};
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
      if ((($a = count < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = count > self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.splice(0, self.length);
        } else {
        return self.splice(self.length - count, self.length);
      };
    }, TMP_64.$$arity = -1);

    Opal.defn(self, '$product', TMP_65 = function $$product($a_rest) {
      var self = this, args, $iter = TMP_65.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_65.$$p = null;
      
      var result = (block !== nil) ? null : [],
          n = args.length + 1,
          counters = new Array(n),
          lengths  = new Array(n),
          arrays   = new Array(n),
          i, m, subarray, len, resultlen = 1;

      arrays[0] = self;
      for (i = 1; i < n; i++) {
        arrays[i] = $scope.get('Opal').$coerce_to(args[i - 1], $scope.get('Array'), "to_ary");
      }

      for (i = 0; i < n; i++) {
        len = arrays[i].length;
        if (len === 0) {
          return result || self;
        }
        resultlen *= len;
        if (resultlen > 2147483647) {
          self.$raise($scope.get('RangeError'), "too big to product")
        }
        lengths[i] = len;
        counters[i] = 0;
      }

      outer_loop: for (;;) {
        subarray = [];
        for (i = 0; i < n; i++) {
          subarray.push(arrays[i][counters[i]]);
        }
        if (result) {
          result.push(subarray);
        } else {
          Opal.yield1(block, subarray)
        }
        m = n - 1;
        counters[m]++;
        while (counters[m] === lengths[m]) {
          counters[m] = 0;
          if (--m < 0) break outer_loop;
          counters[m]++;
        }
      }

      return result || self;
    ;
    }, TMP_65.$$arity = -1);

    Opal.defn(self, '$push', TMP_66 = function $$push($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = objects.length; i < length; i++) {
        self.push(objects[i]);
      }
    
      return self;
    }, TMP_66.$$arity = -1);

    Opal.defn(self, '$rassoc', TMP_67 = function $$rassoc(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        item = self[i];

        if (item.length && item[1] !== undefined) {
          if ((item[1])['$=='](object)) {
            return item;
          }
        }
      }

      return nil;
    
    }, TMP_67.$$arity = 1);

    Opal.defn(self, '$reject', TMP_68 = function $$reject() {
      var $a, $b, TMP_69, self = this, $iter = TMP_68.$$p, block = $iter || nil;

      TMP_68.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_69 = function(){var self = TMP_69.$$s || this;

        return self.$size()}, TMP_69.$$s = self, TMP_69.$$arity = 0, TMP_69), $a).call($b, "reject")
      };
      
      var result = [];

      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value === false || value === nil) {
          result.push(self[i]);
        }
      }
      return result;
    
    }, TMP_68.$$arity = 0);

    Opal.defn(self, '$reject!', TMP_70 = function() {
      var $a, $b, TMP_71, $c, self = this, $iter = TMP_70.$$p, block = $iter || nil, original = nil;

      TMP_70.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_71 = function(){var self = TMP_71.$$s || this;

        return self.$size()}, TMP_71.$$s = self, TMP_71.$$arity = 0, TMP_71), $a).call($b, "reject!")
      };
      original = self.$length();
      ($a = ($c = self).$delete_if, $a.$$p = block.$to_proc(), $a).call($c);
      if (self.$length()['$=='](original)) {
        return nil
        } else {
        return self
      };
    }, TMP_70.$$arity = 0);

    Opal.defn(self, '$replace', TMP_72 = function $$replace(other) {
      var $a, self = this;

      if ((($a = $scope.get('Array')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = $scope.get('Opal').$coerce_to(other, $scope.get('Array'), "to_ary").$to_a()
      };
      
      self.splice(0, self.length);
      self.push.apply(self, other);
    
      return self;
    }, TMP_72.$$arity = 1);

    Opal.defn(self, '$reverse', TMP_73 = function $$reverse() {
      var self = this;

      return self.slice(0).reverse();
    }, TMP_73.$$arity = 0);

    Opal.defn(self, '$reverse!', TMP_74 = function() {
      var self = this;

      return self.reverse();
    }, TMP_74.$$arity = 0);

    Opal.defn(self, '$reverse_each', TMP_75 = function $$reverse_each() {
      var $a, $b, TMP_76, $c, self = this, $iter = TMP_75.$$p, block = $iter || nil;

      TMP_75.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_76 = function(){var self = TMP_76.$$s || this;

        return self.$size()}, TMP_76.$$s = self, TMP_76.$$arity = 0, TMP_76), $a).call($b, "reverse_each")
      };
      ($a = ($c = self.$reverse()).$each, $a.$$p = block.$to_proc(), $a).call($c);
      return self;
    }, TMP_75.$$arity = 0);

    Opal.defn(self, '$rindex', TMP_77 = function $$rindex(object) {
      var self = this, $iter = TMP_77.$$p, block = $iter || nil;

      TMP_77.$$p = null;
      
      var i, value;

      if (object != null) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }

          value = block(self[i]);

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else if (object == null) {
        return self.$enum_for("rindex");
      }

      return nil;
    
    }, TMP_77.$$arity = -1);

    Opal.defn(self, '$rotate', TMP_78 = function $$rotate(n) {
      var self = this;

      if (n == null) {
        n = 1;
      }
      n = $scope.get('Opal').$coerce_to(n, $scope.get('Integer'), "to_int");
      
      var ary, idx, firstPart, lastPart;

      if (self.length === 1) {
        return self.slice();
      }
      if (self.length === 0) {
        return [];
      }

      ary = self.slice();
      idx = n % ary.length;

      firstPart = ary.slice(idx);
      lastPart = ary.slice(0, idx);
      return firstPart.concat(lastPart);
    
    }, TMP_78.$$arity = -1);

    Opal.defn(self, '$rotate!', TMP_79 = function(cnt) {
      var self = this, ary = nil;

      if (cnt == null) {
        cnt = 1;
      }
      
      if (self.length === 0 || self.length === 1) {
        return self;
      }
    
      cnt = $scope.get('Opal').$coerce_to(cnt, $scope.get('Integer'), "to_int");
      ary = self.$rotate(cnt);
      return self.$replace(ary);
    }, TMP_79.$$arity = -1);

    (function($base, $super) {
      function $SampleRandom(){};
      var self = $SampleRandom = $klass($base, $super, 'SampleRandom', $SampleRandom);

      var def = self.$$proto, $scope = self.$$scope, TMP_80, TMP_81;

      def.rng = nil;
      Opal.defn(self, '$initialize', TMP_80 = function $$initialize(rng) {
        var self = this;

        return self.rng = rng;
      }, TMP_80.$$arity = 1);

      return (Opal.defn(self, '$rand', TMP_81 = function $$rand(size) {
        var $a, self = this, random = nil;

        random = $scope.get('Opal').$coerce_to(self.rng.$rand(size), $scope.get('Integer'), "to_int");
        if ((($a = random < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "random value must be >= 0")};
        if ((($a = random < size) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise($scope.get('RangeError'), "random value must be less than Array size")
        };
        return random;
      }, TMP_81.$$arity = 1), nil) && 'rand';
    })($scope.base, null);

    Opal.defn(self, '$sample', TMP_82 = function $$sample(count, options) {
      var $a, $b, self = this, o = nil, rng = nil;

      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$at($scope.get('Kernel').$rand(self.length))};
      if ((($a = options === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (o = $scope.get('Opal')['$coerce_to?'](count, $scope.get('Hash'), "to_hash"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          options = o;
          count = nil;
          } else {
          options = nil;
          count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
        }
        } else {
        count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
        options = $scope.get('Opal').$coerce_to(options, $scope.get('Hash'), "to_hash");
      };
      if ((($a = (($b = count !== false && count !== nil && count != null) ? count < 0 : count)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "count must be greater than 0")};
      if (options !== false && options !== nil && options != null) {
        rng = options['$[]']("random")};
      if ((($a = (($b = rng !== false && rng !== nil && rng != null) ? rng['$respond_to?']("rand") : rng)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        rng = $scope.get('SampleRandom').$new(rng)
        } else {
        rng = $scope.get('Kernel')
      };
      if (count !== false && count !== nil && count != null) {
        } else {
        return self[rng.$rand(self.length)]
      };
      

      var abandon, spin, result, i, j, k, targetIndex, oldValue;

      if (count > self.length) {
        count = self.length;
      }

      switch (count) {
        case 0:
          return [];
          break;
        case 1:
          return [self[rng.$rand(self.length)]];
          break;
        case 2:
          i = rng.$rand(self.length);
          j = rng.$rand(self.length);
          if (i === j) {
            j = i === 0 ? i + 1 : i - 1;
          }
          return [self[i], self[j]];
          break;
        default:
          if (self.length / count > 3) {
            abandon = false;
            spin = 0;

            result = $scope.get('Array').$new(count);
            i = 1;

            result[0] = rng.$rand(self.length);
            while (i < count) {
              k = rng.$rand(self.length);
              j = 0;

              while (j < i) {
                while (k === result[j]) {
                  spin++;
                  if (spin > 100) {
                    abandon = true;
                    break;
                  }
                  k = rng.$rand(self.length);
                }
                if (abandon) { break; }

                j++;
              }

              if (abandon) { break; }

              result[i] = k;

              i++;
            }

            if (!abandon) {
              i = 0;
              while (i < count) {
                result[i] = self[result[i]];
                i++;
              }

              return result;
            }
          }

          result = self.slice();

          for (var c = 0; c < count; c++) {
            targetIndex = rng.$rand(self.length);
            oldValue = result[c];
            result[c] = result[targetIndex];
            result[targetIndex] = oldValue;
          }

          return count === self.length ? result : (result)['$[]'](0, count);
      }
    
    }, TMP_82.$$arity = -1);

    Opal.defn(self, '$select', TMP_83 = function $$select() {
      var $a, $b, TMP_84, self = this, $iter = TMP_83.$$p, block = $iter || nil;

      TMP_83.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_84 = function(){var self = TMP_84.$$s || this;

        return self.$size()}, TMP_84.$$s = self, TMP_84.$$arity = 0, TMP_84), $a).call($b, "select")
      };
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        value = Opal.yield1(block, item);

        if (value !== false && value !== nil) {
          result.push(item);
        }
      }

      return result;
    
    }, TMP_83.$$arity = 0);

    Opal.defn(self, '$select!', TMP_85 = function() {
      var $a, $b, TMP_86, $c, self = this, $iter = TMP_85.$$p, block = $iter || nil;

      TMP_85.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_86 = function(){var self = TMP_86.$$s || this;

        return self.$size()}, TMP_86.$$s = self, TMP_86.$$arity = 0, TMP_86), $a).call($b, "select!")
      };
      
      var original = self.length;
      ($a = ($c = self).$keep_if, $a.$$p = block.$to_proc(), $a).call($c);
      return self.length === original ? nil : self;
    
    }, TMP_85.$$arity = 0);

    Opal.defn(self, '$shift', TMP_87 = function $$shift(count) {
      var $a, self = this;

      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.shift();};
      count = $scope.get('Opal').$coerce_to(count, $scope.get('Integer'), "to_int");
      if ((($a = count < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "negative array size")};
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      return self.splice(0, count);
    }, TMP_87.$$arity = -1);

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$shuffle', TMP_88 = function $$shuffle(rng) {
      var self = this;

      return self.$dup().$to_a()['$shuffle!'](rng);
    }, TMP_88.$$arity = -1);

    Opal.defn(self, '$shuffle!', TMP_89 = function(rng) {
      var self = this;

      
      var randgen, i = self.length, j, tmp;

      if (rng !== undefined) {
        rng = $scope.get('Opal')['$coerce_to?'](rng, $scope.get('Hash'), "to_hash");

        if (rng !== nil) {
          rng = rng['$[]']("random");

          if (rng !== nil && rng['$respond_to?']("rand")) {
            randgen = rng;
          }
        }
      }

      while (i) {
        if (randgen) {
          j = randgen.$rand(i).$to_int();

          if (j < 0) {
            self.$raise($scope.get('RangeError'), "random number too small " + (j))
          }

          if (j >= i) {
            self.$raise($scope.get('RangeError'), "random number too big " + (j))
          }
        }
        else {
          j = Math.floor(Math.random() * i);
        }

        tmp = self[--i];
        self[i] = self[j];
        self[j] = tmp;
      }

      return self;
    ;
    }, TMP_89.$$arity = -1);

    Opal.alias(self, 'slice', '[]');

    Opal.defn(self, '$slice!', TMP_90 = function(index, length) {
      var $a, self = this, result = nil, range = nil, range_start = nil, range_end = nil, start = nil;

      result = nil;
      if ((($a = length === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $scope.get('Range')['$==='](index)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          range = index;
          result = self['$[]'](range);
          range_start = $scope.get('Opal').$coerce_to(range.$begin(), $scope.get('Integer'), "to_int");
          range_end = $scope.get('Opal').$coerce_to(range.$end(), $scope.get('Integer'), "to_int");
          
          if (range_start < 0) {
            range_start += self.length;
          }

          if (range_end < 0) {
            range_end += self.length;
          } else if (range_end >= self.length) {
            range_end = self.length - 1;
            if (range.exclude) {
              range_end += 1;
            }
          }

          var range_length = range_end - range_start;
          if (range.exclude) {
            range_end -= 1;
          } else {
            range_length += 1;
          }

          if (range_start < self.length && range_start >= 0 && range_end < self.length && range_end >= 0 && range_length > 0) {
            self.splice(range_start, range_length);
          }
        
          } else {
          start = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
          
          if (start < 0) {
            start += self.length;
          }

          if (start < 0 || start >= self.length) {
            return nil;
          }

          result = self[start];

          if (start === 0) {
            self.shift();
          } else {
            self.splice(start, 1);
          }
        
        }
        } else {
        start = $scope.get('Opal').$coerce_to(index, $scope.get('Integer'), "to_int");
        length = $scope.get('Opal').$coerce_to(length, $scope.get('Integer'), "to_int");
        
        if (length < 0) {
          return nil;
        }

        var end = start + length;

        result = self['$[]'](start, length);

        if (start < 0) {
          start += self.length;
        }

        if (start + length > self.length) {
          length = self.length - start;
        }

        if (start < self.length && start >= 0) {
          self.splice(start, length);
        }
      
      };
      return result;
    }, TMP_90.$$arity = -2);

    Opal.defn(self, '$sort', TMP_91 = function $$sort() {
      var $a, self = this, $iter = TMP_91.$$p, block = $iter || nil;

      TMP_91.$$p = null;
      if ((($a = self.length > 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return self
      };
      
      if (block === nil) {
        block = function(a, b) {
          return (a)['$<=>'](b);
        };
      }

      return self.slice().sort(function(x, y) {
        var ret = block(x, y);

        if (ret === nil) {
          self.$raise($scope.get('ArgumentError'), "comparison of " + ((x).$inspect()) + " with " + ((y).$inspect()) + " failed");
        }

        return $rb_gt(ret, 0) ? 1 : ($rb_lt(ret, 0) ? -1 : 0);
      });
    ;
    }, TMP_91.$$arity = 0);

    Opal.defn(self, '$sort!', TMP_92 = function() {
      var $a, $b, self = this, $iter = TMP_92.$$p, block = $iter || nil;

      TMP_92.$$p = null;
      
      var result;

      if ((block !== nil)) {
        result = ($a = ($b = (self.slice())).$sort, $a.$$p = block.$to_proc(), $a).call($b);
      }
      else {
        result = (self.slice()).$sort();
      }

      self.length = 0;
      for(var i = 0, length = result.length; i < length; i++) {
        self.push(result[i]);
      }

      return self;
    ;
    }, TMP_92.$$arity = 0);

    Opal.defn(self, '$sort_by!', TMP_93 = function() {
      var $a, $b, TMP_94, $c, self = this, $iter = TMP_93.$$p, block = $iter || nil;

      TMP_93.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_94 = function(){var self = TMP_94.$$s || this;

        return self.$size()}, TMP_94.$$s = self, TMP_94.$$arity = 0, TMP_94), $a).call($b, "sort_by!")
      };
      return self.$replace(($a = ($c = self).$sort_by, $a.$$p = block.$to_proc(), $a).call($c));
    }, TMP_93.$$arity = 0);

    Opal.defn(self, '$take', TMP_95 = function $$take(count) {
      var self = this;

      
      if (count < 0) {
        self.$raise($scope.get('ArgumentError'));
      }

      return self.slice(0, count);
    ;
    }, TMP_95.$$arity = 1);

    Opal.defn(self, '$take_while', TMP_96 = function $$take_while() {
      var self = this, $iter = TMP_96.$$p, block = $iter || nil;

      TMP_96.$$p = null;
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        value = block(item);

        if (value === false || value === nil) {
          return result;
        }

        result.push(item);
      }

      return result;
    
    }, TMP_96.$$arity = 0);

    Opal.defn(self, '$to_a', TMP_97 = function $$to_a() {
      var self = this;

      return self;
    }, TMP_97.$$arity = 0);

    Opal.alias(self, 'to_ary', 'to_a');

    Opal.defn(self, '$to_h', TMP_98 = function $$to_h() {
      var self = this;

      
      var i, len = self.length, ary, key, val, hash = $hash2([], {});

      for (i = 0; i < len; i++) {
        ary = $scope.get('Opal')['$coerce_to?'](self[i], $scope.get('Array'), "to_ary");
        if (!ary.$$is_array) {
          self.$raise($scope.get('TypeError'), "wrong element type " + ((ary).$class()) + " at " + (i) + " (expected array)")
        }
        if (ary.length !== 2) {
          self.$raise($scope.get('ArgumentError'), "wrong array length at " + (i) + " (expected 2, was " + ((ary).$length()) + ")")
        }
        key = ary[0];
        val = ary[1];
        Opal.hash_put(hash, key, val);
      }

      return hash;
    ;
    }, TMP_98.$$arity = 0);

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$transpose', TMP_101 = function $$transpose() {
      var $a, $b, TMP_99, self = this, result = nil, max = nil;

      if ((($a = self['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      result = [];
      max = nil;
      ($a = ($b = self).$each, $a.$$p = (TMP_99 = function(row){var self = TMP_99.$$s || this, $c, $d, TMP_100;
if (row == null) row = nil;
      if ((($c = $scope.get('Array')['$==='](row)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          row = row.$to_a()
          } else {
          row = $scope.get('Opal').$coerce_to(row, $scope.get('Array'), "to_ary").$to_a()
        };
        ((($c = max) !== false && $c !== nil && $c != null) ? $c : max = row.length);
        if ((($c = (row.length)['$!='](max)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          self.$raise($scope.get('IndexError'), "element size differs (" + (row.length) + " should be " + (max))};
        return ($c = ($d = (row.length)).$times, $c.$$p = (TMP_100 = function(i){var self = TMP_100.$$s || this, $e, $f, $g, entry = nil;
if (i == null) i = nil;
        entry = (($e = i, $f = result, ((($g = $f['$[]']($e)) !== false && $g !== nil && $g != null) ? $g : $f['$[]=']($e, []))));
          return entry['$<<'](row.$at(i));}, TMP_100.$$s = self, TMP_100.$$arity = 1, TMP_100), $c).call($d);}, TMP_99.$$s = self, TMP_99.$$arity = 1, TMP_99), $a).call($b);
      return result;
    }, TMP_101.$$arity = 0);

    Opal.defn(self, '$uniq', TMP_102 = function $$uniq() {
      var self = this, $iter = TMP_102.$$p, block = $iter || nil;

      TMP_102.$$p = null;
      
      var hash = $hash2([], {}), i, length, item, key;

      if (block === nil) {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          if (Opal.hash_get(hash, item) === undefined) {
            Opal.hash_put(hash, item, item);
          }
        }
      }
      else {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          key = Opal.yield1(block, item);
          if (Opal.hash_get(hash, key) === undefined) {
            Opal.hash_put(hash, key, item);
          }
        }
      }

      return toArraySubclass((hash).$values(), self.$class());
    ;
    }, TMP_102.$$arity = 0);

    Opal.defn(self, '$uniq!', TMP_103 = function() {
      var self = this, $iter = TMP_103.$$p, block = $iter || nil;

      TMP_103.$$p = null;
      
      var original_length = self.length, hash = $hash2([], {}), i, length, item, key;

      for (i = 0, length = original_length; i < length; i++) {
        item = self[i];
        key = (block === nil ? item : Opal.yield1(block, item));

        if (Opal.hash_get(hash, key) === undefined) {
          Opal.hash_put(hash, key, item);
          continue;
        }

        self.splice(i, 1);
        length--;
        i--;
      }

      return self.length === original_length ? nil : self;
    ;
    }, TMP_103.$$arity = 0);

    Opal.defn(self, '$unshift', TMP_104 = function $$unshift($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = objects.length - 1; i >= 0; i--) {
        self.unshift(objects[i]);
      }
    
      return self;
    }, TMP_104.$$arity = -1);

    Opal.defn(self, '$values_at', TMP_107 = function $$values_at($a_rest) {
      var $b, $c, TMP_105, self = this, args, out = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      out = [];
      ($b = ($c = args).$each, $b.$$p = (TMP_105 = function(elem){var self = TMP_105.$$s || this, $a, $d, TMP_106, finish = nil, start = nil, i = nil;
if (elem == null) elem = nil;
      if ((($a = elem['$kind_of?']($scope.get('Range'))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          finish = $scope.get('Opal').$coerce_to(elem.$last(), $scope.get('Integer'), "to_int");
          start = $scope.get('Opal').$coerce_to(elem.$first(), $scope.get('Integer'), "to_int");
          
          if (start < 0) {
            start = start + self.length;
            return nil;;
          }
        
          
          if (finish < 0) {
            finish = finish + self.length;
          }
          if (elem['$exclude_end?']()) {
            finish--;
          }
          if (finish < start) {
            return nil;;
          }
        
          return ($a = ($d = start).$upto, $a.$$p = (TMP_106 = function(i){var self = TMP_106.$$s || this;
if (i == null) i = nil;
          return out['$<<'](self.$at(i))}, TMP_106.$$s = self, TMP_106.$$arity = 1, TMP_106), $a).call($d, finish);
          } else {
          i = $scope.get('Opal').$coerce_to(elem, $scope.get('Integer'), "to_int");
          return out['$<<'](self.$at(i));
        }}, TMP_105.$$s = self, TMP_105.$$arity = 1, TMP_105), $b).call($c);
      return out;
    }, TMP_107.$$arity = -1);

    Opal.defn(self, '$zip', TMP_108 = function $$zip($a_rest) {
      var $b, self = this, others, $iter = TMP_108.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      others = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        others[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_108.$$p = null;
      
      var result = [], size = self.length, part, o, i, j, jj;

      for (j = 0, jj = others.length; j < jj; j++) {
        o = others[j];
        if (o.$$is_array) {
          continue;
        }
        if (o.$$is_enumerator) {
          if (o.$size() === Infinity) {
            others[j] = o.$take(size);
          } else {
            others[j] = o.$to_a();
          }
          continue;
        }
        others[j] = (((($b = $scope.get('Opal')['$coerce_to?'](o, $scope.get('Array'), "to_ary")) !== false && $b !== nil && $b != null) ? $b : $scope.get('Opal')['$coerce_to!'](o, $scope.get('Enumerator'), "each"))).$to_a();
      }

      for (i = 0; i < size; i++) {
        part = [self[i]];

        for (j = 0, jj = others.length; j < jj; j++) {
          o = others[j][i];

          if (o == null) {
            o = nil;
          }

          part[j + 1] = o;
        }

        result[i] = part;
      }

      if (block !== nil) {
        for (i = 0; i < size; i++) {
          block(result[i]);
        }

        return nil;
      }

      return result;
    
    }, TMP_108.$$arity = -1);

    Opal.defs(self, '$inherited', TMP_109 = function $$inherited(klass) {
      var self = this;

      
      klass.$$proto.$to_a = function() {
        return this.slice(0, this.length);
      }
    
    }, TMP_109.$$arity = 1);

    Opal.defn(self, '$instance_variables', TMP_111 = function $$instance_variables() {
      var $a, $b, TMP_110, $c, $d, self = this, $iter = TMP_111.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_111.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      return ($a = ($b = ($c = ($d = self, Opal.find_super_dispatcher(self, 'instance_variables', TMP_111, false)), $c.$$p = $iter, $c).apply($d, $zuper)).$reject, $a.$$p = (TMP_110 = function(ivar){var self = TMP_110.$$s || this, $c;
if (ivar == null) ivar = nil;
      return ((($c = /^@\d+$/.test(ivar)) !== false && $c !== nil && $c != null) ? $c : ivar['$==']("@length"))}, TMP_110.$$s = self, TMP_110.$$arity = 1, TMP_110), $a).call($b);
    }, TMP_111.$$arity = 0);

    return $scope.get('Opal').$pristine(self, "allocate", "copy_instance_variables", "initialize_dup");
  })($scope.base, Array);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/hash"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$[]', '$merge!', '$allocate', '$raise', '$==', '$coerce_to!', '$lambda?', '$abs', '$arity', '$call', '$enum_for', '$size', '$inspect', '$flatten', '$eql?', '$default', '$to_proc', '$dup', '$===', '$default_proc', '$default_proc=', '$default=', '$alias_method']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_18, TMP_20, TMP_22, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_44, TMP_46, TMP_47, TMP_49, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55;

    self.$include($scope.get('Enumerable'));

    def.$$is_hash = true;

    Opal.defs(self, '$[]', TMP_1 = function($a_rest) {
      var self = this, argv;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      argv = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        argv[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var hash, argc = argv.length, i;

      if (argc === 1) {
        hash = $scope.get('Opal')['$coerce_to?'](argv['$[]'](0), $scope.get('Hash'), "to_hash");
        if (hash !== nil) {
          return self.$allocate()['$merge!'](hash);
        }

        argv = $scope.get('Opal')['$coerce_to?'](argv['$[]'](0), $scope.get('Array'), "to_ary");
        if (argv === nil) {
          self.$raise($scope.get('ArgumentError'), "odd number of arguments for Hash")
        }

        argc = argv.length;
        hash = self.$allocate();

        for (i = 0; i < argc; i++) {
          if (!argv[i].$$is_array) continue;
          switch(argv[i].length) {
          case 1:
            hash.$store(argv[i][0], nil);
            break;
          case 2:
            hash.$store(argv[i][0], argv[i][1]);
            break;
          default:
            self.$raise($scope.get('ArgumentError'), "invalid number of elements (" + (argv[i].length) + " for 1..2)")
          }
        }

        return hash;
      }

      if (argc % 2 !== 0) {
        self.$raise($scope.get('ArgumentError'), "odd number of arguments for Hash")
      }

      hash = self.$allocate();

      for (i = 0; i < argc; i += 2) {
        hash.$store(argv[i], argv[i + 1]);
      }

      return hash;
    ;
    }, TMP_1.$$arity = -1);

    Opal.defs(self, '$allocate', TMP_2 = function $$allocate() {
      var self = this;

      
      var hash = new self.$$alloc();

      Opal.hash_init(hash);

      hash.$$none = nil;
      hash.$$proc = nil;

      return hash;
    
    }, TMP_2.$$arity = 0);

    Opal.defs(self, '$try_convert', TMP_3 = function $$try_convert(obj) {
      var self = this;

      return $scope.get('Opal')['$coerce_to?'](obj, $scope.get('Hash'), "to_hash");
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$initialize', TMP_4 = function $$initialize(defaults) {
      var self = this, $iter = TMP_4.$$p, block = $iter || nil;

      TMP_4.$$p = null;
      
      if (defaults !== undefined && block !== nil) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (1 for 0)")
      }
      self.$$none = (defaults === undefined ? nil : defaults);
      self.$$proc = block;
    ;
      return self;
    }, TMP_4.$$arity = -1);

    Opal.defn(self, '$==', TMP_5 = function(other) {
      var self = this;

      
      if (self === other) {
        return true;
      }

      if (!other.$$is_hash) {
        return false;
      }

      if (self.$$keys.length !== other.$$keys.length) {
        return false;
      }

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, other_value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
          other_value = other.$$smap[key];
        } else {
          value = key.value;
          other_value = Opal.hash_get(other, key.key);
        }

        if (other_value === undefined || !value['$eql?'](other_value)) {
          return false;
        }
      }

      return true;
    
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$[]', TMP_6 = function(key) {
      var self = this;

      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      return self.$default(key);
    
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$[]=', TMP_7 = function(key, value) {
      var self = this;

      
      Opal.hash_put(self, key, value);
      return value;
    
    }, TMP_7.$$arity = 2);

    Opal.defn(self, '$assoc', TMP_8 = function $$assoc(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          if ((key)['$=='](object)) {
            return [key, self.$$smap[key]];
          }
        } else {
          if ((key.key)['$=='](object)) {
            return [key.key, key.value];
          }
        }
      }

      return nil;
    
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$clear', TMP_9 = function $$clear() {
      var self = this;

      
      Opal.hash_init(self);
      return self;
    
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$clone', TMP_10 = function $$clone() {
      var self = this;

      
      var hash = new self.$$class.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$default', TMP_11 = function(key) {
      var self = this;

      
      if (key !== undefined && self.$$proc !== nil && self.$$proc !== undefined) {
        return self.$$proc.$call(self, key);
      }
      if (self.$$none === undefined) {
        return nil;
      }
      return self.$$none;
    
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$default=', TMP_12 = function(object) {
      var self = this;

      
      self.$$proc = nil;
      self.$$none = object;

      return object;
    
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$default_proc', TMP_13 = function $$default_proc() {
      var self = this;

      
      if (self.$$proc !== undefined) {
        return self.$$proc;
      }
      return nil;
    
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$default_proc=', TMP_14 = function(proc) {
      var self = this;

      
      if (proc !== nil) {
        proc = $scope.get('Opal')['$coerce_to!'](proc, $scope.get('Proc'), "to_proc");

        if (proc['$lambda?']() && proc.$arity().$abs() !== 2) {
          self.$raise($scope.get('TypeError'), "default_proc takes two arguments");
        }
      }

      self.$$none = nil;
      self.$$proc = proc;

      return proc;
    ;
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$delete', TMP_15 = function(key) {
      var self = this, $iter = TMP_15.$$p, block = $iter || nil;

      TMP_15.$$p = null;
      
      var value = Opal.hash_delete(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        return block.$call(key);
      }

      return nil;
    
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$delete_if', TMP_16 = function $$delete_if() {
      var $a, $b, TMP_17, self = this, $iter = TMP_16.$$p, block = $iter || nil;

      TMP_16.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_17 = function(){var self = TMP_17.$$s || this;

        return self.$size()}, TMP_17.$$s = self, TMP_17.$$arity = 0, TMP_17), $a).call($b, "delete_if")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    
    }, TMP_16.$$arity = 0);

    Opal.alias(self, 'dup', 'clone');

    Opal.defn(self, '$each', TMP_18 = function $$each() {
      var $a, $b, TMP_19, self = this, $iter = TMP_18.$$p, block = $iter || nil;

      TMP_18.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_19 = function(){var self = TMP_19.$$s || this;

        return self.$size()}, TMP_19.$$s = self, TMP_19.$$arity = 0, TMP_19), $a).call($b, "each")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        Opal.yield1(block, [key, value]);
      }

      return self;
    
    }, TMP_18.$$arity = 0);

    Opal.defn(self, '$each_key', TMP_20 = function $$each_key() {
      var $a, $b, TMP_21, self = this, $iter = TMP_20.$$p, block = $iter || nil;

      TMP_20.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_21 = function(){var self = TMP_21.$$s || this;

        return self.$size()}, TMP_21.$$s = self, TMP_21.$$arity = 0, TMP_21), $a).call($b, "each_key")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        block(key.$$is_string ? key : key.key);
      }

      return self;
    
    }, TMP_20.$$arity = 0);

    Opal.alias(self, 'each_pair', 'each');

    Opal.defn(self, '$each_value', TMP_22 = function $$each_value() {
      var $a, $b, TMP_23, self = this, $iter = TMP_22.$$p, block = $iter || nil;

      TMP_22.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_23 = function(){var self = TMP_23.$$s || this;

        return self.$size()}, TMP_23.$$s = self, TMP_23.$$arity = 0, TMP_23), $a).call($b, "each_value")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        block(key.$$is_string ? self.$$smap[key] : key.value);
      }

      return self;
    
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$empty?', TMP_24 = function() {
      var self = this;

      return self.$$keys.length === 0;
    }, TMP_24.$$arity = 0);

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$fetch', TMP_25 = function $$fetch(key, defaults) {
      var self = this, $iter = TMP_25.$$p, block = $iter || nil;

      TMP_25.$$p = null;
      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        return block(key);
      }

      if (defaults !== undefined) {
        return defaults;
      }
    
      return self.$raise($scope.get('KeyError'), "key not found: " + (key.$inspect()));
    }, TMP_25.$$arity = -2);

    Opal.defn(self, '$flatten', TMP_26 = function $$flatten(level) {
      var self = this;

      if (level == null) {
        level = 1;
      }
      level = $scope.get('Opal')['$coerce_to!'](level, $scope.get('Integer'), "to_int");
      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push(key);

        if (value.$$is_array) {
          if (level === 1) {
            result.push(value);
            continue;
          }

          result = result.concat((value).$flatten(level - 2));
          continue;
        }

        result.push(value);
      }

      return result;
    
    }, TMP_26.$$arity = -1);

    Opal.defn(self, '$has_key?', TMP_27 = function(key) {
      var self = this;

      return Opal.hash_get(self, key) !== undefined;
    }, TMP_27.$$arity = 1);

    Opal.defn(self, '$has_value?', TMP_28 = function(value) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (((key.$$is_string ? self.$$smap[key] : key.value))['$=='](value)) {
          return true;
        }
      }

      return false;
    
    }, TMP_28.$$arity = 1);

    Opal.defn(self, '$hash', TMP_29 = function $$hash() {
      var self = this;

      
      var top = (Opal.hash_ids === undefined),
          hash_id = self.$object_id(),
          result = ['Hash'],
          key, item;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (var i = 0, keys = self.$$keys, length = keys.length; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            result.push([key, self.$$smap[key].$hash()]);
          } else {
            result.push([key.key_hash, key.value.$hash()]);
          }
        }

        return result.sort().join();

      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    }, TMP_29.$$arity = 0);

    Opal.alias(self, 'include?', 'has_key?');

    Opal.defn(self, '$index', TMP_30 = function $$index(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return key;
        }
      }

      return nil;
    
    }, TMP_30.$$arity = 1);

    Opal.defn(self, '$indexes', TMP_31 = function $$indexes($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var result = [];

      for (var i = 0, length = args.length, key, value; i < length; i++) {
        key = args[i];
        value = Opal.hash_get(self, key);

        if (value === undefined) {
          result.push(self.$default());
          continue;
        }

        result.push(value);
      }

      return result;
    
    }, TMP_31.$$arity = -1);

    Opal.alias(self, 'indices', 'indexes');

    var inspect_ids;

    Opal.defn(self, '$inspect', TMP_32 = function $$inspect() {
      var self = this;

      
      var top = (inspect_ids === undefined),
          hash_id = self.$object_id(),
          result = [];

      try {
        if (top) {
          inspect_ids = {};
        }

        if (inspect_ids.hasOwnProperty(hash_id)) {
          return '{...}';
        }

        inspect_ids[hash_id] = true;

        for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            value = self.$$smap[key];
          } else {
            value = key.value;
            key = key.key;
          }

          result.push(key.$inspect() + '=>' + value.$inspect());
        }

        return '{' + result.join(', ') + '}';

      } finally {
        if (top) {
          inspect_ids = undefined;
        }
      }
    
    }, TMP_32.$$arity = 0);

    Opal.defn(self, '$invert', TMP_33 = function $$invert() {
      var self = this;

      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        Opal.hash_put(hash, value, key);
      }

      return hash;
    
    }, TMP_33.$$arity = 0);

    Opal.defn(self, '$keep_if', TMP_34 = function $$keep_if() {
      var $a, $b, TMP_35, self = this, $iter = TMP_34.$$p, block = $iter || nil;

      TMP_34.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_35 = function(){var self = TMP_35.$$s || this;

        return self.$size()}, TMP_35.$$s = self, TMP_35.$$arity = 0, TMP_35), $a).call($b, "keep_if")
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    
    }, TMP_34.$$arity = 0);

    Opal.alias(self, 'key', 'index');

    Opal.alias(self, 'key?', 'has_key?');

    Opal.defn(self, '$keys', TMP_36 = function $$keys() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(key);
        } else {
          result.push(key.key);
        }
      }

      return result;
    
    }, TMP_36.$$arity = 0);

    Opal.defn(self, '$length', TMP_37 = function $$length() {
      var self = this;

      return self.$$keys.length;
    }, TMP_37.$$arity = 0);

    Opal.alias(self, 'member?', 'has_key?');

    Opal.defn(self, '$merge', TMP_38 = function $$merge(other) {
      var $a, $b, self = this, $iter = TMP_38.$$p, block = $iter || nil;

      TMP_38.$$p = null;
      return ($a = ($b = self.$dup())['$merge!'], $a.$$p = block.$to_proc(), $a).call($b, other);
    }, TMP_38.$$arity = 1);

    Opal.defn(self, '$merge!', TMP_39 = function(other) {
      var self = this, $iter = TMP_39.$$p, block = $iter || nil;

      TMP_39.$$p = null;
      
      if (!$scope.get('Hash')['$==='](other)) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Hash'), "to_hash");
      }

      var i, other_keys = other.$$keys, length = other_keys.length, key, value, other_value;

      if (block === nil) {
        for (i = 0; i < length; i++) {
          key = other_keys[i];

          if (key.$$is_string) {
            other_value = other.$$smap[key];
          } else {
            other_value = key.value;
            key = key.key;
          }

          Opal.hash_put(self, key, other_value);
        }

        return self;
      }

      for (i = 0; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        value = Opal.hash_get(self, key);

        if (value === undefined) {
          Opal.hash_put(self, key, other_value);
          continue;
        }

        Opal.hash_put(self, key, block(key, value, other_value));
      }

      return self;
    ;
    }, TMP_39.$$arity = 1);

    Opal.defn(self, '$rassoc', TMP_40 = function $$rassoc(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return [key, value];
        }
      }

      return nil;
    
    }, TMP_40.$$arity = 1);

    Opal.defn(self, '$rehash', TMP_41 = function $$rehash() {
      var self = this;

      
      Opal.hash_rehash(self);
      return self;
    
    }, TMP_41.$$arity = 0);

    Opal.defn(self, '$reject', TMP_42 = function $$reject() {
      var $a, $b, TMP_43, self = this, $iter = TMP_42.$$p, block = $iter || nil;

      TMP_42.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_43 = function(){var self = TMP_43.$$s || this;

        return self.$size()}, TMP_43.$$s = self, TMP_43.$$arity = 0, TMP_43), $a).call($b, "reject")
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    
    }, TMP_42.$$arity = 0);

    Opal.defn(self, '$reject!', TMP_44 = function() {
      var $a, $b, TMP_45, self = this, $iter = TMP_44.$$p, block = $iter || nil;

      TMP_44.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_45 = function(){var self = TMP_45.$$s || this;

        return self.$size()}, TMP_45.$$s = self, TMP_45.$$arity = 0, TMP_45), $a).call($b, "reject!")
      };
      
      var changes_were_made = false;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            changes_were_made = true;
            length--;
            i--;
          }
        }
      }

      return changes_were_made ? self : nil;
    
    }, TMP_44.$$arity = 0);

    Opal.defn(self, '$replace', TMP_46 = function $$replace(other) {
      var $a, $b, self = this;

      other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Hash'), "to_hash");
      
      Opal.hash_init(self);

      for (var i = 0, other_keys = other.$$keys, length = other_keys.length, key, value, other_value; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        Opal.hash_put(self, key, other_value);
      }
    
      if ((($a = other.$default_proc()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (($a = [other.$default_proc()]), $b = self, $b['$default_proc='].apply($b, $a), $a[$a.length-1])
        } else {
        (($a = [other.$default()]), $b = self, $b['$default='].apply($b, $a), $a[$a.length-1])
      };
      return self;
    }, TMP_46.$$arity = 1);

    Opal.defn(self, '$select', TMP_47 = function $$select() {
      var $a, $b, TMP_48, self = this, $iter = TMP_47.$$p, block = $iter || nil;

      TMP_47.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_48 = function(){var self = TMP_48.$$s || this;

        return self.$size()}, TMP_48.$$s = self, TMP_48.$$arity = 0, TMP_48), $a).call($b, "select")
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    
    }, TMP_47.$$arity = 0);

    Opal.defn(self, '$select!', TMP_49 = function() {
      var $a, $b, TMP_50, self = this, $iter = TMP_49.$$p, block = $iter || nil;

      TMP_49.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_50 = function(){var self = TMP_50.$$s || this;

        return self.$size()}, TMP_50.$$s = self, TMP_50.$$arity = 0, TMP_50), $a).call($b, "select!")
      };
      
      var result = nil;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
          result = self;
        }
      }

      return result;
    
    }, TMP_49.$$arity = 0);

    Opal.defn(self, '$shift', TMP_51 = function $$shift() {
      var self = this;

      
      var keys = self.$$keys,
          key;

      if (keys.length > 0) {
        key = keys[0];

        key = key.$$is_string ? key : key.key;

        return [key, Opal.hash_delete(self, key)];
      }

      return self.$default(nil);
    
    }, TMP_51.$$arity = 0);

    Opal.alias(self, 'size', 'length');

    self.$alias_method("store", "[]=");

    Opal.defn(self, '$to_a', TMP_52 = function $$to_a() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push([key, value]);
      }

      return result;
    
    }, TMP_52.$$arity = 0);

    Opal.defn(self, '$to_h', TMP_53 = function $$to_h() {
      var self = this;

      
      if (self.$$class === Opal.Hash) {
        return self;
      }

      var hash = new Opal.Hash.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    }, TMP_53.$$arity = 0);

    Opal.defn(self, '$to_hash', TMP_54 = function $$to_hash() {
      var self = this;

      return self;
    }, TMP_54.$$arity = 0);

    Opal.alias(self, 'to_s', 'inspect');

    Opal.alias(self, 'update', 'merge!');

    Opal.alias(self, 'value?', 'has_value?');

    Opal.alias(self, 'values_at', 'indexes');

    return (Opal.defn(self, '$values', TMP_55 = function $$values() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(self.$$smap[key]);
        } else {
          result.push(key.value);
        }
      }

      return result;
    
    }, TMP_55.$$arity = 0), nil) && 'values';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/number"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$bridge', '$raise', '$class', '$Float', '$respond_to?', '$coerce_to!', '$__coerced__', '$===', '$!', '$>', '$**', '$new', '$<', '$to_f', '$==', '$nan?', '$infinite?', '$enum_for', '$+', '$-', '$gcd', '$lcm', '$/', '$frexp', '$to_i', '$ldexp', '$rationalize', '$*', '$<<', '$to_r', '$-@', '$size', '$<=', '$>=']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Number(){};
    var self = $Number = $klass($base, $super, 'Number', $Number);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_43, TMP_44, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_52, TMP_54, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_61, TMP_62, TMP_63, TMP_64, TMP_65, TMP_66, TMP_67;

    $scope.get('Opal').$bridge(self, Number);

    Number.prototype.$$is_number = true;

    Opal.defn(self, '$coerce', TMP_1 = function $$coerce(other) {
      var self = this;

      
      if (other === nil) {
        self.$raise($scope.get('TypeError'), "can't convert " + (other.$class()) + " into Float");
      }
      else if (other.$$is_string) {
        return [self.$Float(other), self];
      }
      else if (other['$respond_to?']("to_f")) {
        return [$scope.get('Opal')['$coerce_to!'](other, $scope.get('Float'), "to_f"), self];
      }
      else if (other.$$is_number) {
        return [other, self];
      }
      else {
        self.$raise($scope.get('TypeError'), "can't convert " + (other.$class()) + " into Float");
      }
    ;
    }, TMP_1.$$arity = 1);

    Opal.defn(self, '$__id__', TMP_2 = function $$__id__() {
      var self = this;

      return (self * 2) + 1;
    }, TMP_2.$$arity = 0);

    Opal.alias(self, 'object_id', '__id__');

    Opal.defn(self, '$+', TMP_3 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self + other;
      }
      else {
        return self.$__coerced__("+", other);
      }
    
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$-', TMP_4 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self - other;
      }
      else {
        return self.$__coerced__("-", other);
      }
    
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$*', TMP_5 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self * other;
      }
      else {
        return self.$__coerced__("*", other);
      }
    
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$/', TMP_6 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self / other;
      }
      else {
        return self.$__coerced__("/", other);
      }
    
    }, TMP_6.$$arity = 1);

    Opal.alias(self, 'fdiv', '/');

    Opal.defn(self, '$%', TMP_7 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        if (other == -Infinity) {
          return other;
        }
        else if (other == 0) {
          self.$raise($scope.get('ZeroDivisionError'), "divided by 0");
        }
        else if (other < 0 || self < 0) {
          return (self % other + other) % other;
        }
        else {
          return self % other;
        }
      }
      else {
        return self.$__coerced__("%", other);
      }
    
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$&', TMP_8 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self & other;
      }
      else {
        return self.$__coerced__("&", other);
      }
    
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$|', TMP_9 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self | other;
      }
      else {
        return self.$__coerced__("|", other);
      }
    
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$^', TMP_10 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self ^ other;
      }
      else {
        return self.$__coerced__("^", other);
      }
    
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$<', TMP_11 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self < other;
      }
      else {
        return self.$__coerced__("<", other);
      }
    
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$<=', TMP_12 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self <= other;
      }
      else {
        return self.$__coerced__("<=", other);
      }
    
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$>', TMP_13 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self > other;
      }
      else {
        return self.$__coerced__(">", other);
      }
    
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$>=', TMP_14 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self >= other;
      }
      else {
        return self.$__coerced__(">=", other);
      }
    
    }, TMP_14.$$arity = 1);

    
    var spaceship_operator = function(self, other) {
      if (other.$$is_number) {
        if (isNaN(self) || isNaN(other)) {
          return nil;
        }

        if (self > other) {
          return 1;
        } else if (self < other) {
          return -1;
        } else {
          return 0;
        }
      }
      else {
        return self.$__coerced__("<=>", other);
      }
    }
  

    Opal.defn(self, '$<=>', TMP_15 = function(other) {
      var self = this;

      try {
        
      return spaceship_operator(self, other);
    
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
          try {
            return nil
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$<<', TMP_16 = function(count) {
      var self = this;

      count = $scope.get('Opal')['$coerce_to!'](count, $scope.get('Integer'), "to_int");
      return count > 0 ? self << count : self >> -count;
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$>>', TMP_17 = function(count) {
      var self = this;

      count = $scope.get('Opal')['$coerce_to!'](count, $scope.get('Integer'), "to_int");
      return count > 0 ? self >> count : self << -count;
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$[]', TMP_18 = function(bit) {
      var self = this;

      bit = $scope.get('Opal')['$coerce_to!'](bit, $scope.get('Integer'), "to_int");
      
      if (bit < 0) {
        return 0;
      }
      if (bit >= 32) {
        return self < 0 ? 1 : 0;
      }
      return (self >> bit) & 1;
    ;
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$+@', TMP_19 = function() {
      var self = this;

      return +self;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$-@', TMP_20 = function() {
      var self = this;

      return -self;
    }, TMP_20.$$arity = 0);

    Opal.defn(self, '$~', TMP_21 = function() {
      var self = this;

      return ~self;
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$**', TMP_22 = function(other) {
      var $a, $b, $c, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = ($scope.get('Integer')['$==='](self))['$!']()) !== false && $b !== nil && $b != null) ? $b : $rb_gt(other, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return Math.pow(self, other);
          } else {
          return $scope.get('Rational').$new(self, 1)['$**'](other)
        }
      } else if ((($a = (($b = $rb_lt(self, 0)) ? (((($c = $scope.get('Float')['$==='](other)) !== false && $c !== nil && $c != null) ? $c : $scope.get('Rational')['$==='](other))) : $rb_lt(self, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Complex').$new(self, 0)['$**'](other.$to_f())
      } else if ((($a = other.$$is_number != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Math.pow(self, other);
        } else {
        return self.$__coerced__("**", other)
      };
    }, TMP_22.$$arity = 1);

    Opal.defn(self, '$==', TMP_23 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self == Number(other);
      }
      else if (other['$respond_to?']("==")) {
        return other['$=='](self);
      }
      else {
        return false;
      }
    ;
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$abs', TMP_24 = function $$abs() {
      var self = this;

      return Math.abs(self);
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$abs2', TMP_25 = function $$abs2() {
      var self = this;

      return Math.abs(self * self);
    }, TMP_25.$$arity = 0);

    Opal.defn(self, '$angle', TMP_26 = function $$angle() {
      var $a, self = this;

      if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      if (self == 0) {
        if (1 / self > 0) {
          return 0;
        }
        else {
          return Math.PI;
        }
      }
      else if (self < 0) {
        return Math.PI;
      }
      else {
        return 0;
      }
    
    }, TMP_26.$$arity = 0);

    Opal.alias(self, 'arg', 'angle');

    Opal.alias(self, 'phase', 'angle');

    Opal.defn(self, '$bit_length', TMP_27 = function $$bit_length() {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('NoMethodError').$new("undefined method `bit_length` for " + (self) + ":Float", "bit_length"))
      };
      
      if (self === 0 || self === -1) {
        return 0;
      }

      var result = 0,
          value  = self < 0 ? ~self : self;

      while (value != 0) {
        result   += 1;
        value  >>>= 1;
      }

      return result;
    
    }, TMP_27.$$arity = 0);

    Opal.defn(self, '$ceil', TMP_28 = function $$ceil() {
      var self = this;

      return Math.ceil(self);
    }, TMP_28.$$arity = 0);

    Opal.defn(self, '$chr', TMP_29 = function $$chr(encoding) {
      var self = this;

      return String.fromCharCode(self);
    }, TMP_29.$$arity = -1);

    Opal.defn(self, '$denominator', TMP_30 = function $$denominator() {
      var $a, $b, self = this, $iter = TMP_30.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_30.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 1
        } else {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'denominator', TMP_30, false)), $a.$$p = $iter, $a).apply($b, $zuper)
      };
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$downto', TMP_31 = function $$downto(stop) {
      var $a, $b, TMP_32, self = this, $iter = TMP_31.$$p, block = $iter || nil;

      TMP_31.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_32 = function(){var self = TMP_32.$$s || this, $c;

        if ((($c = $scope.get('Numeric')['$==='](stop)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($c = $rb_gt(stop, self)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(self, stop), 1)
          };}, TMP_32.$$s = self, TMP_32.$$arity = 0, TMP_32), $a).call($b, "downto", stop)
      };
      
      if (!stop.$$is_number) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i >= stop; i--) {
        block(i);
      }
    ;
      return self;
    }, TMP_31.$$arity = 1);

    Opal.alias(self, 'eql?', '==');

    Opal.defn(self, '$equal?', TMP_33 = function(other) {
      var $a, self = this;

      return ((($a = self['$=='](other)) !== false && $a !== nil && $a != null) ? $a : isNaN(self) && isNaN(other));
    }, TMP_33.$$arity = 1);

    Opal.defn(self, '$even?', TMP_34 = function() {
      var self = this;

      return self % 2 === 0;
    }, TMP_34.$$arity = 0);

    Opal.defn(self, '$floor', TMP_35 = function $$floor() {
      var self = this;

      return Math.floor(self);
    }, TMP_35.$$arity = 0);

    Opal.defn(self, '$gcd', TMP_36 = function $$gcd(other) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an integer")
      };
      
      var min = Math.abs(self),
          max = Math.abs(other);

      while (min > 0) {
        var tmp = min;

        min = max % min;
        max = tmp;
      }

      return max;
    
    }, TMP_36.$$arity = 1);

    Opal.defn(self, '$gcdlcm', TMP_37 = function $$gcdlcm(other) {
      var self = this;

      return [self.$gcd(), self.$lcm()];
    }, TMP_37.$$arity = 1);

    Opal.defn(self, '$integer?', TMP_38 = function() {
      var self = this;

      return self % 1 === 0;
    }, TMP_38.$$arity = 0);

    Opal.defn(self, '$is_a?', TMP_39 = function(klass) {
      var $a, $b, self = this, $iter = TMP_39.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_39.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = (($b = klass['$==']($scope.get('Fixnum'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Fixnum')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Integer'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Integer')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Float'))) ? $scope.get('Float')['$==='](self) : klass['$==']($scope.get('Float')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      return ($a = ($b = self, Opal.find_super_dispatcher(self, 'is_a?', TMP_39, false)), $a.$$p = $iter, $a).apply($b, $zuper);
    }, TMP_39.$$arity = 1);

    Opal.alias(self, 'kind_of?', 'is_a?');

    Opal.defn(self, '$instance_of?', TMP_40 = function(klass) {
      var $a, $b, self = this, $iter = TMP_40.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_40.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = (($b = klass['$==']($scope.get('Fixnum'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Fixnum')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Integer'))) ? $scope.get('Integer')['$==='](self) : klass['$==']($scope.get('Integer')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$==']($scope.get('Float'))) ? $scope.get('Float')['$==='](self) : klass['$==']($scope.get('Float')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      return ($a = ($b = self, Opal.find_super_dispatcher(self, 'instance_of?', TMP_40, false)), $a.$$p = $iter, $a).apply($b, $zuper);
    }, TMP_40.$$arity = 1);

    Opal.defn(self, '$lcm', TMP_41 = function $$lcm(other) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an integer")
      };
      
      if (self == 0 || other == 0) {
        return 0;
      }
      else {
        return Math.abs(self * other / self.$gcd(other));
      }
    
    }, TMP_41.$$arity = 1);

    Opal.alias(self, 'magnitude', 'abs');

    Opal.alias(self, 'modulo', '%');

    Opal.defn(self, '$next', TMP_42 = function $$next() {
      var self = this;

      return self + 1;
    }, TMP_42.$$arity = 0);

    Opal.defn(self, '$nonzero?', TMP_43 = function() {
      var self = this;

      return self == 0 ? nil : self;
    }, TMP_43.$$arity = 0);

    Opal.defn(self, '$numerator', TMP_44 = function $$numerator() {
      var $a, $b, self = this, $iter = TMP_44.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_44.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self
        } else {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'numerator', TMP_44, false)), $a.$$p = $iter, $a).apply($b, $zuper)
      };
    }, TMP_44.$$arity = 0);

    Opal.defn(self, '$odd?', TMP_45 = function() {
      var self = this;

      return self % 2 !== 0;
    }, TMP_45.$$arity = 0);

    Opal.defn(self, '$ord', TMP_46 = function $$ord() {
      var self = this;

      return self;
    }, TMP_46.$$arity = 0);

    Opal.defn(self, '$pred', TMP_47 = function $$pred() {
      var self = this;

      return self - 1;
    }, TMP_47.$$arity = 0);

    Opal.defn(self, '$quo', TMP_48 = function $$quo(other) {
      var $a, $b, self = this, $iter = TMP_48.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_48.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'quo', TMP_48, false)), $a.$$p = $iter, $a).apply($b, $zuper)
        } else {
        return $rb_divide(self, other)
      };
    }, TMP_48.$$arity = 1);

    Opal.defn(self, '$rationalize', TMP_49 = function $$rationalize(eps) {
      var $a, $b, self = this, f = nil, n = nil;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Rational').$new(self, 1)
      } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "Infinity")
      } else if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "NaN")
      } else if ((($a = eps == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), f = ($a[0] == null ? nil : $a[0]), n = ($a[1] == null ? nil : $a[1]), $b;
        f = $scope.get('Math').$ldexp(f, (($scope.get('Float')).$$scope.get('MANT_DIG'))).$to_i();
        n = $rb_minus(n, (($scope.get('Float')).$$scope.get('MANT_DIG')));
        return $scope.get('Rational').$new($rb_times(2, f), (1)['$<<'](($rb_minus(1, n)))).$rationalize($scope.get('Rational').$new(1, (1)['$<<'](($rb_minus(1, n)))));
        } else {
        return self.$to_r().$rationalize(eps)
      };
    }, TMP_49.$$arity = -1);

    Opal.defn(self, '$round', TMP_50 = function $$round(ndigits) {
      var $a, $b, self = this, _ = nil, exp = nil;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ndigits == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = ($b = $scope.get('Float')['$==='](ndigits), $b !== false && $b !== nil && $b != null ?ndigits['$infinite?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "Infinity")};
        ndigits = $scope.get('Opal')['$coerce_to!'](ndigits, $scope.get('Integer'), "to_int");
        if ((($a = $rb_lt(ndigits, (($scope.get('Integer')).$$scope.get('MIN')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('RangeError'), "out of bounds")};
        if ((($a = ndigits >= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        ndigits = ndigits['$-@']();
        
        if (0.415241 * ndigits - 0.125 > self.$size()) {
          return 0;
        }

        var f = Math.pow(10, ndigits),
            x = Math.floor((Math.abs(x) + f / 2) / f) * f;

        return self < 0 ? -x : x;
      ;
        } else {
        if ((($a = ($b = self['$nan?'](), $b !== false && $b !== nil && $b != null ?ndigits == null : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('FloatDomainError'), "NaN")};
        ndigits = $scope.get('Opal')['$coerce_to!'](ndigits || 0, $scope.get('Integer'), "to_int");
        if ((($a = $rb_le(ndigits, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            self.$raise($scope.get('RangeError'), "NaN")
          } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            self.$raise($scope.get('FloatDomainError'), "Infinity")}
        } else if (ndigits['$=='](0)) {
          return Math.round(self)
        } else if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), _ = ($a[0] == null ? nil : $a[0]), exp = ($a[1] == null ? nil : $a[1]), $b;
        if ((($a = $rb_ge(ndigits, $rb_minus(($rb_plus((($scope.get('Float')).$$scope.get('DIG')), 2)), ((function() {if ((($b = $rb_gt(exp, 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return $rb_divide(exp, 4)
          } else {
          return $rb_minus($rb_divide(exp, 3), 1)
        }; return nil; })())))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = $rb_lt(ndigits, ((function() {if ((($b = $rb_gt(exp, 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return $rb_plus($rb_divide(exp, 3), 1)
          } else {
          return $rb_divide(exp, 4)
        }; return nil; })())['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return 0};
        return Math.round(self * Math.pow(10, ndigits)) / Math.pow(10, ndigits);
      };
    }, TMP_50.$$arity = -1);

    Opal.defn(self, '$step', TMP_51 = function $$step(limit, step) {
      var $a, self = this, $iter = TMP_51.$$p, block = $iter || nil;

      if (step == null) {
        step = 1;
      }
      TMP_51.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return self.$enum_for("step", limit, step)
      };
      if ((($a = step == 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "step cannot be 0")};
      
      var value = self;

      if (limit === Infinity || limit === -Infinity) {
        block(value);
        return self;
      }

      if (step > 0) {
        while (value <= limit) {
          block(value);
          value += step;
        }
      }
      else {
        while (value >= limit) {
          block(value);
          value += step;
        }
      }
    
      return self;
    }, TMP_51.$$arity = -2);

    Opal.alias(self, 'succ', 'next');

    Opal.defn(self, '$times', TMP_52 = function $$times() {
      var $a, $b, TMP_53, self = this, $iter = TMP_52.$$p, block = $iter || nil;

      TMP_52.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_53 = function(){var self = TMP_53.$$s || this;

        return self}, TMP_53.$$s = self, TMP_53.$$arity = 0, TMP_53), $a).call($b, "times")
      };
      
      for (var i = 0; i < self; i++) {
        block(i);
      }
    
      return self;
    }, TMP_52.$$arity = 0);

    Opal.defn(self, '$to_f', TMP_54 = function $$to_f() {
      var self = this;

      return self;
    }, TMP_54.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_55 = function $$to_i() {
      var self = this;

      return parseInt(self, 10);
    }, TMP_55.$$arity = 0);

    Opal.alias(self, 'to_int', 'to_i');

    Opal.defn(self, '$to_r', TMP_56 = function $$to_r() {
      var $a, $b, self = this, f = nil, e = nil;

      if ((($a = $scope.get('Integer')['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Rational').$new(self, 1)
        } else {
        $b = $scope.get('Math').$frexp(self), $a = Opal.to_ary($b), f = ($a[0] == null ? nil : $a[0]), e = ($a[1] == null ? nil : $a[1]), $b;
        f = $scope.get('Math').$ldexp(f, (($scope.get('Float')).$$scope.get('MANT_DIG'))).$to_i();
        e = $rb_minus(e, (($scope.get('Float')).$$scope.get('MANT_DIG')));
        return ($rb_times(f, ((($scope.get('Float')).$$scope.get('RADIX'))['$**'](e)))).$to_r();
      };
    }, TMP_56.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_57 = function $$to_s(base) {
      var $a, $b, self = this;

      if (base == null) {
        base = 10;
      }
      if ((($a = ((($b = $rb_lt(base, 2)) !== false && $b !== nil && $b != null) ? $b : $rb_gt(base, 36))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "base must be between 2 and 36")};
      return self.toString(base);
    }, TMP_57.$$arity = -1);

    Opal.alias(self, 'truncate', 'to_i');

    Opal.alias(self, 'inspect', 'to_s');

    Opal.defn(self, '$divmod', TMP_58 = function $$divmod(other) {
      var $a, $b, self = this, $iter = TMP_58.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_58.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : other['$nan?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "NaN")
      } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('FloatDomainError'), "Infinity")
        } else {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'divmod', TMP_58, false)), $a.$$p = $iter, $a).apply($b, $zuper)
      };
    }, TMP_58.$$arity = 1);

    Opal.defn(self, '$upto', TMP_59 = function $$upto(stop) {
      var $a, $b, TMP_60, self = this, $iter = TMP_59.$$p, block = $iter || nil;

      TMP_59.$$p = null;
      if ((block !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_60 = function(){var self = TMP_60.$$s || this, $c;

        if ((($c = $scope.get('Numeric')['$==='](stop)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($c = $rb_lt(stop, self)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(stop, self), 1)
          };}, TMP_60.$$s = self, TMP_60.$$arity = 0, TMP_60), $a).call($b, "upto", stop)
      };
      
      if (!stop.$$is_number) {
        self.$raise($scope.get('ArgumentError'), "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i <= stop; i++) {
        block(i);
      }
    ;
      return self;
    }, TMP_59.$$arity = 1);

    Opal.defn(self, '$zero?', TMP_61 = function() {
      var self = this;

      return self == 0;
    }, TMP_61.$$arity = 0);

    Opal.defn(self, '$size', TMP_62 = function $$size() {
      var self = this;

      return 4;
    }, TMP_62.$$arity = 0);

    Opal.defn(self, '$nan?', TMP_63 = function() {
      var self = this;

      return isNaN(self);
    }, TMP_63.$$arity = 0);

    Opal.defn(self, '$finite?', TMP_64 = function() {
      var self = this;

      return self != Infinity && self != -Infinity && !isNaN(self);
    }, TMP_64.$$arity = 0);

    Opal.defn(self, '$infinite?', TMP_65 = function() {
      var self = this;

      
      if (self == Infinity) {
        return +1;
      }
      else if (self == -Infinity) {
        return -1;
      }
      else {
        return nil;
      }
    
    }, TMP_65.$$arity = 0);

    Opal.defn(self, '$positive?', TMP_66 = function() {
      var self = this;

      return self == Infinity || 1 / self > 0;
    }, TMP_66.$$arity = 0);

    return (Opal.defn(self, '$negative?', TMP_67 = function() {
      var self = this;

      return self == -Infinity || 1 / self < 0;
    }, TMP_67.$$arity = 0), nil) && 'negative?';
  })($scope.base, $scope.get('Numeric'));
  Opal.cdecl($scope, 'Fixnum', $scope.get('Number'));
  (function($base, $super) {
    function $Integer(){};
    var self = $Integer = $klass($base, $super, 'Integer', $Integer);

    var def = self.$$proto, $scope = self.$$scope, TMP_68;

    Opal.defs(self, '$===', TMP_68 = function(other) {
      var self = this;

      
      if (!other.$$is_number) {
        return false;
      }

      return (other % 1) === 0;
    
    }, TMP_68.$$arity = 1);

    Opal.cdecl($scope, 'MAX', Math.pow(2, 30) - 1);

    return Opal.cdecl($scope, 'MIN', -Math.pow(2, 30));
  })($scope.base, $scope.get('Numeric'));
  return (function($base, $super) {
    function $Float(){};
    var self = $Float = $klass($base, $super, 'Float', $Float);

    var def = self.$$proto, $scope = self.$$scope, TMP_69, $a;

    Opal.defs(self, '$===', TMP_69 = function(other) {
      var self = this;

      return !!other.$$is_number;
    }, TMP_69.$$arity = 1);

    Opal.cdecl($scope, 'INFINITY', Infinity);

    Opal.cdecl($scope, 'MAX', Number.MAX_VALUE);

    Opal.cdecl($scope, 'MIN', Number.MIN_VALUE);

    Opal.cdecl($scope, 'NAN', NaN);

    Opal.cdecl($scope, 'DIG', 15);

    Opal.cdecl($scope, 'MANT_DIG', 53);

    Opal.cdecl($scope, 'RADIX', 2);

    if ((($a = (typeof(Number.EPSILON) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      return Opal.cdecl($scope, 'EPSILON', Number.EPSILON)
      } else {
      return Opal.cdecl($scope, 'EPSILON', 2.2204460492503130808472633361816E-16)
    };
  })($scope.base, $scope.get('Numeric'));
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/range"] = function(Opal) {
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$attr_reader', '$<=>', '$raise', '$include?', '$<=', '$<', '$enum_for', '$upto', '$to_proc', '$succ', '$!', '$==', '$===', '$exclude_end?', '$eql?', '$begin', '$end', '$-', '$abs', '$to_i', '$inspect', '$[]']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Range(){};
    var self = $Range = $klass($base, $super, 'Range', $Range);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13;

    def.begin = def.exclude = def.end = nil;
    self.$include($scope.get('Enumerable'));

    def.$$is_range = true;

    self.$attr_reader("begin", "end");

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(first, last, exclude) {
      var $a, self = this;

      if (exclude == null) {
        exclude = false;
      }
      if ((($a = first['$<=>'](last)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'))
      };
      self.begin = first;
      self.end = last;
      return self.exclude = exclude;
    }, TMP_1.$$arity = -3);

    Opal.defn(self, '$==', TMP_2 = function(other) {
      var self = this;

      
      if (!other.$$is_range) {
        return false;
      }

      return self.exclude === other.exclude &&
             self.begin   ==  other.begin &&
             self.end     ==  other.end;
    
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$===', TMP_3 = function(value) {
      var self = this;

      return self['$include?'](value);
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$cover?', TMP_4 = function(value) {
      var $a, $b, self = this;

      return ($a = $rb_le(self.begin, value), $a !== false && $a !== nil && $a != null ?((function() {if ((($b = self.exclude) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return $rb_lt(value, self.end)
        } else {
        return $rb_le(value, self.end)
      }; return nil; })()) : $a);
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$each', TMP_5 = function $$each() {
      var $a, $b, $c, self = this, $iter = TMP_5.$$p, block = $iter || nil, current = nil, last = nil;

      TMP_5.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each")
      };
      
      var i, limit;

      if (self.begin.$$is_number && self.end.$$is_number) {
        if (self.begin % 1 !== 0 || self.end % 1 !== 0) {
          self.$raise($scope.get('TypeError'), "can't iterate from Float")
        }

        for (i = self.begin, limit = self.end + (function() {if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0
        } else {
        return 1
      }; return nil; })(); i < limit; i++) {
          block(i);
        }

        return self;
      }

      if (self.begin.$$is_string && self.end.$$is_string) {
        ($a = ($b = self.begin).$upto, $a.$$p = block.$to_proc(), $a).call($b, self.end, self.exclude)
        return self;
      }
    ;
      current = self.begin;
      last = self.end;
      while ((($c = $rb_lt(current, last)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
      Opal.yield1(block, current);
      current = current.$succ();};
      if ((($a = ($c = self.exclude['$!'](), $c !== false && $c !== nil && $c != null ?current['$=='](last) : $c)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        Opal.yield1(block, current)};
      return self;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$eql?', TMP_6 = function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Range')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = self.exclude['$==='](other['$exclude_end?']()), $b !== false && $b !== nil && $b != null ?self.begin['$eql?'](other.$begin()) : $b), $a !== false && $a !== nil && $a != null ?self.end['$eql?'](other.$end()) : $a);
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$exclude_end?', TMP_7 = function() {
      var self = this;

      return self.exclude;
    }, TMP_7.$$arity = 0);

    Opal.alias(self, 'first', 'begin');

    Opal.alias(self, 'include?', 'cover?');

    Opal.alias(self, 'last', 'end');

    Opal.defn(self, '$max', TMP_8 = function $$max() {
      var $a, $b, self = this, $iter = TMP_8.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_8.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if (($yield !== nil)) {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'max', TMP_8, false)), $a.$$p = $iter, $a).apply($b, $zuper)
        } else {
        return self.exclude ? self.end - 1 : self.end;
      };
    }, TMP_8.$$arity = 0);

    Opal.alias(self, 'member?', 'cover?');

    Opal.defn(self, '$min', TMP_9 = function $$min() {
      var $a, $b, self = this, $iter = TMP_9.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_9.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      if (($yield !== nil)) {
        return ($a = ($b = self, Opal.find_super_dispatcher(self, 'min', TMP_9, false)), $a.$$p = $iter, $a).apply($b, $zuper)
        } else {
        return self.begin
      };
    }, TMP_9.$$arity = 0);

    Opal.alias(self, 'member?', 'include?');

    Opal.defn(self, '$size', TMP_10 = function $$size() {
      var $a, $b, self = this, _begin = nil, _end = nil, infinity = nil;

      _begin = self.begin;
      _end = self.end;
      if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        _end = $rb_minus(_end, 1)};
      if ((($a = ($b = $scope.get('Numeric')['$==='](_begin), $b !== false && $b !== nil && $b != null ?$scope.get('Numeric')['$==='](_end) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = $rb_lt(_end, _begin)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      infinity = (($scope.get('Float')).$$scope.get('INFINITY'));
      if ((($a = ((($b = infinity['$=='](_begin.$abs())) !== false && $b !== nil && $b != null) ? $b : _end.$abs()['$=='](infinity))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return infinity};
      return ((Math.abs(_end - _begin) + 1)).$to_i();
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$step', TMP_11 = function $$step(n) {
      var self = this;

      if (n == null) {
        n = 1;
      }
      return self.$raise($scope.get('NotImplementedError'));
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$to_s', TMP_12 = function $$to_s() {
      var self = this;

      return self.begin.$inspect() + (self.exclude ? '...' : '..') + self.end.$inspect();
    }, TMP_12.$$arity = 0);

    Opal.alias(self, 'inspect', 'to_s');

    return (Opal.defn(self, '$marshal_load', TMP_13 = function $$marshal_load(args) {
      var self = this;

      self.begin = args['$[]']("begin");
      self.end = args['$[]']("end");
      return self.exclude = args['$[]']("excl");
    }, TMP_13.$$arity = 1), nil) && 'marshal_load';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/proc"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$coerce_to!']);
  return (function($base, $super) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10;

    def.$$is_proc = true;

    def.$$is_lambda = false;

    Opal.defs(self, '$new', TMP_1 = function() {
      var self = this, $iter = TMP_1.$$p, block = $iter || nil;

      TMP_1.$$p = null;
      if (block !== false && block !== nil && block != null) {
        } else {
        self.$raise($scope.get('ArgumentError'), "tried to create a Proc object without a block")
      };
      return block;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$call', TMP_2 = function $$call($a_rest) {
      var self = this, args, $iter = TMP_2.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_2.$$p = null;
      
      if (block !== nil) {
        self.$$p = block;
      }

      var result, $brk = self.$$brk;

      if ($brk) {
        try {
          if (self.$$is_lambda) {
            result = self.apply(null, args);
          }
          else {
            result = Opal.yieldX(self, args);
          }
        } catch (err) {
          if (err === $brk) {
            return $brk.$v
          }
          else {
            throw err
          }
        }
      }
      else {
        if (self.$$is_lambda) {
          result = self.apply(null, args);
        }
        else {
          result = Opal.yieldX(self, args);
        }
      }

      return result;
    
    }, TMP_2.$$arity = -1);

    Opal.alias(self, '[]', 'call');

    Opal.alias(self, '===', 'call');

    Opal.alias(self, 'yield', 'call');

    Opal.defn(self, '$to_proc', TMP_3 = function $$to_proc() {
      var self = this;

      return self;
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$lambda?', TMP_4 = function() {
      var self = this;

      return !!self.$$is_lambda;
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$arity', TMP_5 = function $$arity() {
      var self = this;

      
      if (self.$$is_curried) {
        return -1;
      } else {
        return self.$$arity;
      }
    
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$source_location', TMP_6 = function $$source_location() {
      var self = this;

      if (self.$$is_curried) { return nil; }
      return nil;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$binding', TMP_7 = function $$binding() {
      var self = this;

      if (self.$$is_curried) { self.$raise($scope.get('ArgumentError'), "Can't create Binding") };
      return nil;
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$parameters', TMP_8 = function $$parameters() {
      var self = this;

      
      if (self.$$is_curried) {
        return [["rest"]];
      } else if (self.$$parameters) {
        if (self.$$is_lambda) {
          return self.$$parameters;
        } else {
          var result = [], i, length;

          for (i = 0, length = self.$$parameters.length; i < length; i++) {
            var parameter = self.$$parameters[i];

            if (parameter[0] === 'req') {
              // required arguments always have name
              parameter = ['opt', parameter[1]];
            }

            result.push(parameter);
          }

          return result;
        }
      } else {
        return [];
      }
    ;
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$curry', TMP_9 = function $$curry(arity) {
      var self = this;

      
      if (arity === undefined) {
        arity = self.length;
      }
      else {
        arity = $scope.get('Opal')['$coerce_to!'](arity, $scope.get('Integer'), "to_int");
        if (self.$$is_lambda && arity !== self.length) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arity) + " for " + (self.length) + ")")
        }
      }

      function curried () {
        var args = $slice.call(arguments),
            length = args.length,
            result;

        if (length > arity && self.$$is_lambda && !self.$$is_curried) {
          self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (length) + " for " + (arity) + ")")
        }

        if (length >= arity) {
          return self.$call.apply(self, args);
        }

        result = function () {
          return curried.apply(null,
            args.concat($slice.call(arguments)));
        }
        result.$$is_lambda = self.$$is_lambda;
        result.$$is_curried = true;

        return result;
      };

      curried.$$is_lambda = self.$$is_lambda;
      curried.$$is_curried = true;
      return curried;
    
    }, TMP_9.$$arity = -1);

    Opal.defn(self, '$dup', TMP_10 = function $$dup() {
      var self = this;

      
      var original_proc = self.$$original_proc || self,
          proc = function () {
            return original_proc.apply(this, arguments);
          };

      for (var prop in self) {
        if (self.hasOwnProperty(prop)) {
          proc[prop] = self[prop];
        }
      }

      return proc;
    
    }, TMP_10.$$arity = 0);

    return Opal.alias(self, 'clone', 'dup');
  })($scope.base, Function)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/method"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$attr_reader', '$class', '$arity', '$new', '$name']);
  (function($base, $super) {
    function $Method(){};
    var self = $Method = $klass($base, $super, 'Method', $Method);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7;

    def.method = def.receiver = def.owner = def.name = nil;
    self.$attr_reader("owner", "receiver", "name");

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(receiver, method, name) {
      var self = this;

      self.receiver = receiver;
      self.owner = receiver.$class();
      self.name = name;
      return self.method = method;
    }, TMP_1.$$arity = 3);

    Opal.defn(self, '$arity', TMP_2 = function $$arity() {
      var self = this;

      return self.method.$arity();
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$parameters', TMP_3 = function $$parameters() {
      var self = this;

      return self.method.$$parameters;
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$call', TMP_4 = function $$call($a_rest) {
      var self = this, args, $iter = TMP_4.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_4.$$p = null;
      
      self.method.$$p = block;

      return self.method.apply(self.receiver, args);
    ;
    }, TMP_4.$$arity = -1);

    Opal.alias(self, '[]', 'call');

    Opal.defn(self, '$unbind', TMP_5 = function $$unbind() {
      var self = this;

      return $scope.get('UnboundMethod').$new(self.owner, self.method, self.name);
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$to_proc', TMP_6 = function $$to_proc() {
      var self = this;

      
      var proc = function () { return self.$call.apply(self, $slice.call(arguments)); };
      proc.$$unbound = self.method;
      proc.$$is_lambda = true;
      return proc;
    
    }, TMP_6.$$arity = 0);

    return (Opal.defn(self, '$inspect', TMP_7 = function $$inspect() {
      var self = this;

      return "#<Method: " + (self.receiver.$class()) + "#" + (self.name) + ">";
    }, TMP_7.$$arity = 0), nil) && 'inspect';
  })($scope.base, null);
  return (function($base, $super) {
    function $UnboundMethod(){};
    var self = $UnboundMethod = $klass($base, $super, 'UnboundMethod', $UnboundMethod);

    var def = self.$$proto, $scope = self.$$scope, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12;

    def.method = def.name = def.owner = nil;
    self.$attr_reader("owner", "name");

    Opal.defn(self, '$initialize', TMP_8 = function $$initialize(owner, method, name) {
      var self = this;

      self.owner = owner;
      self.method = method;
      return self.name = name;
    }, TMP_8.$$arity = 3);

    Opal.defn(self, '$arity', TMP_9 = function $$arity() {
      var self = this;

      return self.method.$arity();
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$parameters', TMP_10 = function $$parameters() {
      var self = this;

      return self.method.$$parameters;
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$bind', TMP_11 = function $$bind(object) {
      var self = this;

      return $scope.get('Method').$new(object, self.method, self.name);
    }, TMP_11.$$arity = 1);

    return (Opal.defn(self, '$inspect', TMP_12 = function $$inspect() {
      var self = this;

      return "#<UnboundMethod: " + (self.owner.$name()) + "#" + (self.name) + ">";
    }, TMP_12.$$arity = 0), nil) && 'inspect';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/variables"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $hash2 = Opal.hash2;

  Opal.add_stubs(['$new']);
  $gvars["&"] = $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
  $gvars.LOADED_FEATURES = $gvars["\""] = Opal.loaded_features;
  $gvars.LOAD_PATH = $gvars[":"] = [];
  $gvars["/"] = "\n";
  $gvars[","] = nil;
  Opal.cdecl($scope, 'ARGV', []);
  Opal.cdecl($scope, 'ARGF', $scope.get('Object').$new());
  Opal.cdecl($scope, 'ENV', $hash2([], {}));
  $gvars.VERBOSE = false;
  $gvars.DEBUG = false;
  return $gvars.SAFE = 0;
};

/* Generated by Opal 0.10.5 */
Opal.modules["opal/regexp_anchors"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$==', '$new']);
  return (function($base) {
    var $Opal, self = $Opal = $module($base, 'Opal');

    var def = self.$$proto, $scope = self.$$scope;

    Opal.cdecl($scope, 'REGEXP_START', (function() {if ($scope.get('RUBY_ENGINE')['$==']("opal")) {
      return "^"}; return nil; })());

    Opal.cdecl($scope, 'REGEXP_END', (function() {if ($scope.get('RUBY_ENGINE')['$==']("opal")) {
      return "$"}; return nil; })());

    Opal.cdecl($scope, 'FORBIDDEN_STARTING_IDENTIFIER_CHARS', "\\u0001-\\u002F\\u003A-\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");

    Opal.cdecl($scope, 'FORBIDDEN_ENDING_IDENTIFIER_CHARS', "\\u0001-\\u0020\\u0022-\\u002F\\u003A-\\u003E\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");

    Opal.cdecl($scope, 'INLINE_IDENTIFIER_REGEXP', $scope.get('Regexp').$new("[^" + ($scope.get('FORBIDDEN_STARTING_IDENTIFIER_CHARS')) + "]*[^" + ($scope.get('FORBIDDEN_ENDING_IDENTIFIER_CHARS')) + "]"));

    Opal.cdecl($scope, 'FORBIDDEN_CONST_NAME_CHARS', "\\u0001-\\u0020\\u0021-\\u002F\\u003B-\\u003F\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");

    Opal.cdecl($scope, 'CONST_NAME_REGEXP', $scope.get('Regexp').$new("" + ($scope.get('REGEXP_START')) + "(::)?[A-Z][^" + ($scope.get('FORBIDDEN_CONST_NAME_CHARS')) + "]*" + ($scope.get('REGEXP_END'))));
  })($scope.base)
};

/* Generated by Opal 0.10.5 */
Opal.modules["opal/mini"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("opal/base");
  self.$require("corelib/nil");
  self.$require("corelib/boolean");
  self.$require("corelib/string");
  self.$require("corelib/comparable");
  self.$require("corelib/enumerable");
  self.$require("corelib/enumerator");
  self.$require("corelib/array");
  self.$require("corelib/hash");
  self.$require("corelib/number");
  self.$require("corelib/range");
  self.$require("corelib/proc");
  self.$require("corelib/method");
  self.$require("corelib/regexp");
  self.$require("corelib/variables");
  return self.$require("opal/regexp_anchors");
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/string/inheritance"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$new', '$allocate', '$initialize', '$to_proc', '$__send__', '$class', '$clone', '$respond_to?', '$==', '$inspect', '$+', '$*', '$map', '$split', '$enum_for', '$each_line', '$to_a', '$%', '$-']);
  self.$require("corelib/string");
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_1;

    return (Opal.defs(self, '$inherited', TMP_1 = function $$inherited(klass) {
      var self = this, replace = nil;

      replace = $scope.get('Class').$new((($scope.get('String')).$$scope.get('Wrapper')));
      
      klass.$$proto         = replace.$$proto;
      klass.$$proto.$$class = klass;
      klass.$$alloc         = replace.$$alloc;
      klass.$$parent        = (($scope.get('String')).$$scope.get('Wrapper'));

      klass.$allocate = replace.$allocate;
      klass.$new      = replace.$new;
    
    }, TMP_1.$$arity = 1), nil) && 'inherited'
  })($scope.base, null);
  return (function($base, $super) {
    function $Wrapper(){};
    var self = $Wrapper = $klass($base, $super, 'Wrapper', $Wrapper);

    var def = self.$$proto, $scope = self.$$scope, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_15, TMP_16, TMP_17, TMP_19, TMP_20, TMP_21;

    def.literal = nil;
    def.$$is_string = true;

    Opal.defs(self, '$allocate', TMP_2 = function $$allocate(string) {
      var $a, $b, self = this, $iter = TMP_2.$$p, $yield = $iter || nil, obj = nil;

      if (string == null) {
        string = "";
      }
      TMP_2.$$p = null;
      obj = ($a = ($b = self, Opal.find_super_dispatcher(self, 'allocate', TMP_2, false, $Wrapper)), $a.$$p = null, $a).call($b);
      obj.literal = string;
      return obj;
    }, TMP_2.$$arity = -1);

    Opal.defs(self, '$new', TMP_3 = function($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_3.$$p, block = $iter || nil, obj = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_3.$$p = null;
      obj = self.$allocate();
      ($b = ($c = obj).$initialize, $b.$$p = block.$to_proc(), $b).apply($c, Opal.to_a(args));
      return obj;
    }, TMP_3.$$arity = -1);

    Opal.defs(self, '$[]', TMP_4 = function($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.$allocate(objects);
    }, TMP_4.$$arity = -1);

    Opal.defn(self, '$initialize', TMP_5 = function $$initialize(string) {
      var self = this;

      if (string == null) {
        string = "";
      }
      return self.literal = string;
    }, TMP_5.$$arity = -1);

    Opal.defn(self, '$method_missing', TMP_6 = function $$method_missing($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_6.$$p, block = $iter || nil, result = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_6.$$p = null;
      result = ($b = ($c = self.literal).$__send__, $b.$$p = block.$to_proc(), $b).apply($c, Opal.to_a(args));
      if ((($b = result.$$is_string != null) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if ((($b = result == self.literal) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return self
          } else {
          return self.$class().$allocate(result)
        }
        } else {
        return result
      };
    }, TMP_6.$$arity = -1);

    Opal.defn(self, '$initialize_copy', TMP_7 = function $$initialize_copy(other) {
      var self = this;

      return self.literal = (other.literal).$clone();
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$respond_to?', TMP_8 = function(name, $a_rest) {
      var $b, $c, $d, self = this, $iter = TMP_8.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_8.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      return ((($b = ($c = ($d = self, Opal.find_super_dispatcher(self, 'respond_to?', TMP_8, false)), $c.$$p = $iter, $c).apply($d, $zuper)) !== false && $b !== nil && $b != null) ? $b : self.literal['$respond_to?'](name));
    }, TMP_8.$$arity = -2);

    Opal.defn(self, '$==', TMP_9 = function(other) {
      var self = this;

      return self.literal['$=='](other);
    }, TMP_9.$$arity = 1);

    Opal.alias(self, 'eql?', '==');

    Opal.alias(self, '===', '==');

    Opal.defn(self, '$to_s', TMP_10 = function $$to_s() {
      var self = this;

      return self.literal;
    }, TMP_10.$$arity = 0);

    Opal.alias(self, 'to_str', 'to_s');

    Opal.defn(self, '$inspect', TMP_11 = function $$inspect() {
      var self = this;

      return self.literal.$inspect();
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$+', TMP_12 = function(other) {
      var self = this;

      return $rb_plus(self.literal, other);
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$*', TMP_13 = function(other) {
      var self = this;

      
      var result = $rb_times(self.literal, other);

      if (result.$$is_string) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$split', TMP_15 = function $$split(pattern, limit) {
      var $a, $b, TMP_14, self = this;

      return ($a = ($b = self.literal.$split(pattern, limit)).$map, $a.$$p = (TMP_14 = function(str){var self = TMP_14.$$s || this;
if (str == null) str = nil;
      return self.$class().$allocate(str)}, TMP_14.$$s = self, TMP_14.$$arity = 1, TMP_14), $a).call($b);
    }, TMP_15.$$arity = -1);

    Opal.defn(self, '$replace', TMP_16 = function $$replace(string) {
      var self = this;

      return self.literal = string;
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$each_line', TMP_17 = function $$each_line(separator) {
      var $a, $b, TMP_18, self = this, $iter = TMP_17.$$p, $yield = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_17.$$p = null;
      if (($yield !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      return ($a = ($b = self.literal).$each_line, $a.$$p = (TMP_18 = function(str){var self = TMP_18.$$s || this;
if (str == null) str = nil;
      return Opal.yield1($yield, self.$class().$allocate(str));}, TMP_18.$$s = self, TMP_18.$$arity = 1, TMP_18), $a).call($b, separator);
    }, TMP_17.$$arity = -1);

    Opal.defn(self, '$lines', TMP_19 = function $$lines(separator) {
      var $a, $b, self = this, $iter = TMP_19.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_19.$$p = null;
      e = ($a = ($b = self).$each_line, $a.$$p = block.$to_proc(), $a).call($b, separator);
      if (block !== false && block !== nil && block != null) {
        return self
        } else {
        return e.$to_a()
      };
    }, TMP_19.$$arity = -1);

    Opal.defn(self, '$%', TMP_20 = function(data) {
      var self = this;

      return self.literal['$%'](data);
    }, TMP_20.$$arity = 1);

    return (Opal.defn(self, '$instance_variables', TMP_21 = function $$instance_variables() {
      var $a, $b, self = this, $iter = TMP_21.$$p, $yield = $iter || nil, $zuper = nil, $zuper_index = nil, $zuper_length = nil;

      TMP_21.$$p = null;
      $zuper = [];
      
      for($zuper_index = 0; $zuper_index < arguments.length; $zuper_index++) {
        $zuper[$zuper_index] = arguments[$zuper_index];
      }
      return $rb_minus(($a = ($b = self, Opal.find_super_dispatcher(self, 'instance_variables', TMP_21, false)), $a.$$p = $iter, $a).apply($b, $zuper), ["@literal"]);
    }, TMP_21.$$arity = 0), nil) && 'instance_variables';
  })($scope.get('String'), null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/string/encoding"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var $a, $b, TMP_13, $c, TMP_16, $d, TMP_19, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$+', '$[]', '$new', '$to_proc', '$each', '$const_set', '$sub', '$upcase', '$const_get', '$===', '$==', '$name', '$include?', '$names', '$constants', '$raise', '$attr_accessor', '$attr_reader', '$register', '$length', '$bytes', '$to_a', '$each_byte', '$bytesize', '$enum_for', '$force_encoding', '$dup', '$coerce_to!', '$find', '$nil?', '$getbyte']);
  self.$require("corelib/string");
  (function($base, $super) {
    function $Encoding(){};
    var self = $Encoding = $klass($base, $super, 'Encoding', $Encoding);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12;

    def.ascii = def.dummy = def.name = nil;
    Opal.defs(self, '$register', TMP_1 = function $$register(name, options) {
      var $a, $b, $c, TMP_2, self = this, $iter = TMP_1.$$p, block = $iter || nil, names = nil, encoding = nil;

      if (options == null) {
        options = $hash2([], {});
      }
      TMP_1.$$p = null;
      names = $rb_plus([name], (((($a = options['$[]']("aliases")) !== false && $a !== nil && $a != null) ? $a : [])));
      encoding = ($a = ($b = $scope.get('Class')).$new, $a.$$p = block.$to_proc(), $a).call($b, self).$new(name, names, ((($a = options['$[]']("ascii")) !== false && $a !== nil && $a != null) ? $a : false), ((($a = options['$[]']("dummy")) !== false && $a !== nil && $a != null) ? $a : false));
      return ($a = ($c = names).$each, $a.$$p = (TMP_2 = function(name){var self = TMP_2.$$s || this;
if (name == null) name = nil;
      return self.$const_set(name.$sub("-", "_"), encoding)}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2), $a).call($c);
    }, TMP_1.$$arity = -2);

    Opal.defs(self, '$find', TMP_4 = function $$find(name) {try {

      var $a, $b, TMP_3, self = this, upcase = nil;

      upcase = name.$upcase();
      ($a = ($b = self.$constants()).$each, $a.$$p = (TMP_3 = function(const$){var self = TMP_3.$$s || this, $c, $d, encoding = nil;
if (const$ == null) const$ = nil;
      encoding = self.$const_get(const$);
        if ((($c = $scope.get('Encoding')['$==='](encoding)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        if ((($c = ((($d = encoding.$name()['$=='](upcase)) !== false && $d !== nil && $d != null) ? $d : encoding.$names()['$include?'](upcase))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          Opal.ret(encoding)
          } else {
          return nil
        };}, TMP_3.$$s = self, TMP_3.$$arity = 1, TMP_3), $a).call($b);
      return self.$raise($scope.get('ArgumentError'), "unknown encoding name - " + (name));
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_4.$$arity = 1);

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return self.$attr_accessor("default_external")
    })(Opal.get_singleton_class(self));

    self.$attr_reader("name", "names");

    Opal.defn(self, '$initialize', TMP_5 = function $$initialize(name, names, ascii, dummy) {
      var self = this;

      self.name = name;
      self.names = names;
      self.ascii = ascii;
      return self.dummy = dummy;
    }, TMP_5.$$arity = 4);

    Opal.defn(self, '$ascii_compatible?', TMP_6 = function() {
      var self = this;

      return self.ascii;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$dummy?', TMP_7 = function() {
      var self = this;

      return self.dummy;
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_8 = function $$to_s() {
      var self = this;

      return self.name;
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_9 = function $$inspect() {
      var $a, self = this;

      return "#<Encoding:" + (self.name) + ((function() {if ((($a = self.dummy) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " (dummy)"
        } else {
        return nil
      }; return nil; })()) + ">";
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$each_byte', TMP_10 = function $$each_byte($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    }, TMP_10.$$arity = -1);

    Opal.defn(self, '$getbyte', TMP_11 = function $$getbyte($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$bytesize', TMP_12 = function $$bytesize($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'));
    }, TMP_12.$$arity = -1);

    (function($base, $super) {
      function $EncodingError(){};
      var self = $EncodingError = $klass($base, $super, 'EncodingError', $EncodingError);

      var def = self.$$proto, $scope = self.$$scope;

      return nil;
    })($scope.base, $scope.get('StandardError'));

    return (function($base, $super) {
      function $CompatibilityError(){};
      var self = $CompatibilityError = $klass($base, $super, 'CompatibilityError', $CompatibilityError);

      var def = self.$$proto, $scope = self.$$scope;

      return nil;
    })($scope.base, $scope.get('EncodingError'));
  })($scope.base, null);
  ($a = ($b = $scope.get('Encoding')).$register, $a.$$p = (TMP_13 = function(){var self = TMP_13.$$s || this, TMP_14, TMP_15;

  Opal.def(self, '$each_byte', TMP_14 = function $$each_byte(string) {
      var self = this, $iter = TMP_14.$$p, block = $iter || nil;

      TMP_14.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        if (code <= 0x7f) {
          Opal.yield1(block, code);
        }
        else {
          var encoded = encodeURIComponent(string.charAt(i)).substr(1).split('%');

          for (var j = 0, encoded_length = encoded.length; j < encoded_length; j++) {
            Opal.yield1(block, parseInt(encoded[j], 16));
          }
        }
      }
    
    }, TMP_14.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_15 = function $$bytesize() {
      var self = this;

      return self.$bytes().$length();
    }, TMP_15.$$arity = 0), nil) && 'bytesize';}, TMP_13.$$s = self, TMP_13.$$arity = 0, TMP_13), $a).call($b, "UTF-8", $hash2(["aliases", "ascii"], {"aliases": ["CP65001"], "ascii": true}));
  ($a = ($c = $scope.get('Encoding')).$register, $a.$$p = (TMP_16 = function(){var self = TMP_16.$$s || this, TMP_17, TMP_18;

  Opal.def(self, '$each_byte', TMP_17 = function $$each_byte(string) {
      var self = this, $iter = TMP_17.$$p, block = $iter || nil;

      TMP_17.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        Opal.yield1(block, code & 0xff);
        Opal.yield1(block, code >> 8);
      }
    
    }, TMP_17.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_18 = function $$bytesize() {
      var self = this;

      return self.$bytes().$length();
    }, TMP_18.$$arity = 0), nil) && 'bytesize';}, TMP_16.$$s = self, TMP_16.$$arity = 0, TMP_16), $a).call($c, "UTF-16LE");
  ($a = ($d = $scope.get('Encoding')).$register, $a.$$p = (TMP_19 = function(){var self = TMP_19.$$s || this, TMP_20, TMP_21;

  Opal.def(self, '$each_byte', TMP_20 = function $$each_byte(string) {
      var self = this, $iter = TMP_20.$$p, block = $iter || nil;

      TMP_20.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        Opal.yield1(block, string.charCodeAt(i) & 0xff);
      }
    
    }, TMP_20.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_21 = function $$bytesize() {
      var self = this;

      return self.$bytes().$length();
    }, TMP_21.$$arity = 0), nil) && 'bytesize';}, TMP_19.$$s = self, TMP_19.$$arity = 0, TMP_19), $a).call($d, "ASCII-8BIT", $hash2(["aliases", "ascii"], {"aliases": ["BINARY"], "ascii": true}));
  return (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28;

    def.encoding = nil;
    String.prototype.encoding = (($scope.get('Encoding')).$$scope.get('UTF_16LE'));

    Opal.defn(self, '$bytes', TMP_22 = function $$bytes() {
      var self = this;

      return self.$each_byte().$to_a();
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$bytesize', TMP_23 = function $$bytesize() {
      var self = this;

      return self.encoding.$bytesize(self);
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$each_byte', TMP_24 = function $$each_byte() {
      var $a, $b, self = this, $iter = TMP_24.$$p, block = $iter || nil;

      TMP_24.$$p = null;
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_byte")
      };
      ($a = ($b = self.encoding).$each_byte, $a.$$p = block.$to_proc(), $a).call($b, self);
      return self;
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$encode', TMP_25 = function $$encode(encoding) {
      var self = this;

      return self.$dup().$force_encoding(encoding);
    }, TMP_25.$$arity = 1);

    Opal.defn(self, '$encoding', TMP_26 = function $$encoding() {
      var self = this;

      return self.encoding;
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$force_encoding', TMP_27 = function $$force_encoding(encoding) {
      var $a, self = this;

      encoding = $scope.get('Opal')['$coerce_to!'](encoding, $scope.get('String'), "to_str");
      encoding = $scope.get('Encoding').$find(encoding);
      if (encoding['$=='](self.encoding)) {
        return self};
      if ((($a = encoding['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('ArgumentError'), "unknown encoding name - " + (encoding))};
      
      var result = new String(self);
      result.encoding = encoding;

      return result;
    
    }, TMP_27.$$arity = 1);

    return (Opal.defn(self, '$getbyte', TMP_28 = function $$getbyte(idx) {
      var self = this;

      return self.encoding.$getbyte(self, idx);
    }, TMP_28.$$arity = 1), nil) && 'getbyte';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/math"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$raise', '$Float', '$type_error', '$Integer', '$module_function', '$checked', '$float!', '$===', '$gamma', '$-', '$integer!', '$/', '$infinite?']);
  return (function($base) {
    var $Math, self = $Math = $module($base, 'Math');

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, $a, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29;

    Opal.cdecl($scope, 'E', Math.E);

    Opal.cdecl($scope, 'PI', Math.PI);

    Opal.cdecl($scope, 'DomainError', $scope.get('Class').$new($scope.get('StandardError')));

    Opal.defs(self, '$checked', TMP_1 = function $$checked(method, $a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      if (isNaN(args[0]) || (args.length == 2 && isNaN(args[1]))) {
        return NaN;
      }

      var result = Math[method].apply(null, args);

      if (isNaN(result)) {
        self.$raise($scope.get('DomainError'), "Numerical argument is out of domain - \"" + (method) + "\"");
      }

      return result;
    
    }, TMP_1.$$arity = -2);

    Opal.defs(self, '$float!', TMP_2 = function(value) {
      var self = this;

      try {
        return self.$Float(value)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
          try {
            return self.$raise($scope.get('Opal').$type_error(value, $scope.get('Float')))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_2.$$arity = 1);

    Opal.defs(self, '$integer!', TMP_3 = function(value) {
      var self = this;

      try {
        return self.$Integer(value)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('ArgumentError')])) {
          try {
            return self.$raise($scope.get('Opal').$type_error(value, $scope.get('Integer')))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_3.$$arity = 1);

    self.$module_function();

    Opal.defn(self, '$acos', TMP_4 = function $$acos(x) {
      var self = this;

      return $scope.get('Math').$checked("acos", $scope.get('Math')['$float!'](x));
    }, TMP_4.$$arity = 1);

    if ((($a = (typeof(Math.acosh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.acosh = function(x) {
        return Math.log(x + Math.sqrt(x * x - 1));
      }
    
    };

    Opal.defn(self, '$acosh', TMP_5 = function $$acosh(x) {
      var self = this;

      return $scope.get('Math').$checked("acosh", $scope.get('Math')['$float!'](x));
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$asin', TMP_6 = function $$asin(x) {
      var self = this;

      return $scope.get('Math').$checked("asin", $scope.get('Math')['$float!'](x));
    }, TMP_6.$$arity = 1);

    if ((($a = (typeof(Math.asinh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.asinh = function(x) {
        return Math.log(x + Math.sqrt(x * x + 1))
      }
    ;
    };

    Opal.defn(self, '$asinh', TMP_7 = function $$asinh(x) {
      var self = this;

      return $scope.get('Math').$checked("asinh", $scope.get('Math')['$float!'](x));
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$atan', TMP_8 = function $$atan(x) {
      var self = this;

      return $scope.get('Math').$checked("atan", $scope.get('Math')['$float!'](x));
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$atan2', TMP_9 = function $$atan2(y, x) {
      var self = this;

      return $scope.get('Math').$checked("atan2", $scope.get('Math')['$float!'](y), $scope.get('Math')['$float!'](x));
    }, TMP_9.$$arity = 2);

    if ((($a = (typeof(Math.atanh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.atanh = function(x) {
        return 0.5 * Math.log((1 + x) / (1 - x));
      }
    
    };

    Opal.defn(self, '$atanh', TMP_10 = function $$atanh(x) {
      var self = this;

      return $scope.get('Math').$checked("atanh", $scope.get('Math')['$float!'](x));
    }, TMP_10.$$arity = 1);

    if ((($a = (typeof(Math.cbrt) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cbrt = function(x) {
        if (x == 0) {
          return 0;
        }

        if (x < 0) {
          return -Math.cbrt(-x);
        }

        var r  = x,
            ex = 0;

        while (r < 0.125) {
          r *= 8;
          ex--;
        }

        while (r > 1.0) {
          r *= 0.125;
          ex++;
        }

        r = (-0.46946116 * r + 1.072302) * r + 0.3812513;

        while (ex < 0) {
          r *= 0.5;
          ex++;
        }

        while (ex > 0) {
          r *= 2;
          ex--;
        }

        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);

        return r;
      }
    
    };

    Opal.defn(self, '$cbrt', TMP_11 = function $$cbrt(x) {
      var self = this;

      return $scope.get('Math').$checked("cbrt", $scope.get('Math')['$float!'](x));
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$cos', TMP_12 = function $$cos(x) {
      var self = this;

      return $scope.get('Math').$checked("cos", $scope.get('Math')['$float!'](x));
    }, TMP_12.$$arity = 1);

    if ((($a = (typeof(Math.cosh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cosh = function(x) {
        return (Math.exp(x) + Math.exp(-x)) / 2;
      }
    
    };

    Opal.defn(self, '$cosh', TMP_13 = function $$cosh(x) {
      var self = this;

      return $scope.get('Math').$checked("cosh", $scope.get('Math')['$float!'](x));
    }, TMP_13.$$arity = 1);

    if ((($a = (typeof(Math.erf) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erf = function(x) {
        var A1 =  0.254829592,
            A2 = -0.284496736,
            A3 =  1.421413741,
            A4 = -1.453152027,
            A5 =  1.061405429,
            P  =  0.3275911;

        var sign = 1;

        if (x < 0) {
            sign = -1;
        }

        x = Math.abs(x);

        var t = 1.0 / (1.0 + P * x);
        var y = 1.0 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * Math.exp(-x * x);

        return sign * y;
      }
    
    };

    Opal.defn(self, '$erf', TMP_14 = function $$erf(x) {
      var self = this;

      return $scope.get('Math').$checked("erf", $scope.get('Math')['$float!'](x));
    }, TMP_14.$$arity = 1);

    if ((($a = (typeof(Math.erfc) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erfc = function(x) {
        var z = Math.abs(x),
            t = 1.0 / (0.5 * z + 1.0);

        var A1 = t * 0.17087277 + -0.82215223,
            A2 = t * A1 + 1.48851587,
            A3 = t * A2 + -1.13520398,
            A4 = t * A3 + 0.27886807,
            A5 = t * A4 + -0.18628806,
            A6 = t * A5 + 0.09678418,
            A7 = t * A6 + 0.37409196,
            A8 = t * A7 + 1.00002368,
            A9 = t * A8,
            A10 = -z * z - 1.26551223 + A9;

        var a = t * Math.exp(A10);

        if (x < 0.0) {
          return 2.0 - a;
        }
        else {
          return a;
        }
      }
    
    };

    Opal.defn(self, '$erfc', TMP_15 = function $$erfc(x) {
      var self = this;

      return $scope.get('Math').$checked("erfc", $scope.get('Math')['$float!'](x));
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$exp', TMP_16 = function $$exp(x) {
      var self = this;

      return $scope.get('Math').$checked("exp", $scope.get('Math')['$float!'](x));
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$frexp', TMP_17 = function $$frexp(x) {
      var self = this;

      x = $scope.get('Math')['$float!'](x);
      
      if (isNaN(x)) {
        return [NaN, 0];
      }

      var ex   = Math.floor(Math.log(Math.abs(x)) / Math.log(2)) + 1,
          frac = x / Math.pow(2, ex);

      return [frac, ex];
    
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$gamma', TMP_18 = function $$gamma(n) {
      var self = this;

      n = $scope.get('Math')['$float!'](n);
      
      var i, t, x, value, result, twoN, threeN, fourN, fiveN;

      var G = 4.7421875;

      var P = [
         0.99999999999999709182,
         57.156235665862923517,
        -59.597960355475491248,
         14.136097974741747174,
        -0.49191381609762019978,
         0.33994649984811888699e-4,
         0.46523628927048575665e-4,
        -0.98374475304879564677e-4,
         0.15808870322491248884e-3,
        -0.21026444172410488319e-3,
         0.21743961811521264320e-3,
        -0.16431810653676389022e-3,
         0.84418223983852743293e-4,
        -0.26190838401581408670e-4,
         0.36899182659531622704e-5
      ];


      if (isNaN(n)) {
        return NaN;
      }

      if (n === 0 && 1 / n < 0) {
        return -Infinity;
      }

      if (n === -1 || n === -Infinity) {
        self.$raise($scope.get('DomainError'), "Numerical argument is out of domain - \"gamma\"");
      }

      if ($scope.get('Integer')['$==='](n)) {
        if (n <= 0) {
          return isFinite(n) ? Infinity : NaN;
        }

        if (n > 171) {
          return Infinity;
        }

        value  = n - 2;
        result = n - 1;

        while (value > 1) {
          result *= value;
          value--;
        }

        if (result == 0) {
          result = 1;
        }

        return result;
      }

      if (n < 0.5) {
        return Math.PI / (Math.sin(Math.PI * n) * $scope.get('Math').$gamma($rb_minus(1, n)));
      }

      if (n >= 171.35) {
        return Infinity;
      }

      if (n > 85.0) {
        twoN   = n * n;
        threeN = twoN * n;
        fourN  = threeN * n;
        fiveN  = fourN * n;

        return Math.sqrt(2 * Math.PI / n) * Math.pow((n / Math.E), n) *
          (1 + 1 / (12 * n) + 1 / (288 * twoN) - 139 / (51840 * threeN) -
          571 / (2488320 * fourN) + 163879 / (209018880 * fiveN) +
          5246819 / (75246796800 * fiveN * n));
      }

      n -= 1;
      x  = P[0];

      for (i = 1; i < P.length; ++i) {
        x += P[i] / (n + i);
      }

      t = n + G + 0.5;

      return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
    
    }, TMP_18.$$arity = 1);

    if ((($a = (typeof(Math.hypot) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.hypot = function(x, y) {
        return Math.sqrt(x * x + y * y)
      }
    ;
    };

    Opal.defn(self, '$hypot', TMP_19 = function $$hypot(x, y) {
      var self = this;

      return $scope.get('Math').$checked("hypot", $scope.get('Math')['$float!'](x), $scope.get('Math')['$float!'](y));
    }, TMP_19.$$arity = 2);

    Opal.defn(self, '$ldexp', TMP_20 = function $$ldexp(mantissa, exponent) {
      var self = this;

      mantissa = $scope.get('Math')['$float!'](mantissa);
      exponent = $scope.get('Math')['$integer!'](exponent);
      
      if (isNaN(exponent)) {
        self.$raise($scope.get('RangeError'), "float NaN out of range of integer");
      }

      return mantissa * Math.pow(2, exponent);
    ;
    }, TMP_20.$$arity = 2);

    Opal.defn(self, '$lgamma', TMP_21 = function $$lgamma(n) {
      var self = this;

      
      if (n == -1) {
        return [Infinity, 1];
      }
      else {
        return [Math.log(Math.abs($scope.get('Math').$gamma(n))), $scope.get('Math').$gamma(n) < 0 ? -1 : 1];
      }
    ;
    }, TMP_21.$$arity = 1);

    Opal.defn(self, '$log', TMP_22 = function $$log(x, base) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      if ((($a = base == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Math').$checked("log", $scope.get('Math')['$float!'](x))
        } else {
        if ((($a = $scope.get('String')['$==='](base)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('Opal').$type_error(base, $scope.get('Float')))};
        return $rb_divide($scope.get('Math').$checked("log", $scope.get('Math')['$float!'](x)), $scope.get('Math').$checked("log", $scope.get('Math')['$float!'](base)));
      };
    }, TMP_22.$$arity = -2);

    if ((($a = (typeof(Math.log10) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log10 = function(x) {
        return Math.log(x) / Math.LN10;
      }
    
    };

    Opal.defn(self, '$log10', TMP_23 = function $$log10(x) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      return $scope.get('Math').$checked("log10", $scope.get('Math')['$float!'](x));
    }, TMP_23.$$arity = 1);

    if ((($a = (typeof(Math.log2) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log2 = function(x) {
        return Math.log(x) / Math.LN2;
      }
    
    };

    Opal.defn(self, '$log2', TMP_24 = function $$log2(x) {
      var $a, self = this;

      if ((($a = $scope.get('String')['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('Opal').$type_error(x, $scope.get('Float')))};
      return $scope.get('Math').$checked("log2", $scope.get('Math')['$float!'](x));
    }, TMP_24.$$arity = 1);

    Opal.defn(self, '$sin', TMP_25 = function $$sin(x) {
      var self = this;

      return $scope.get('Math').$checked("sin", $scope.get('Math')['$float!'](x));
    }, TMP_25.$$arity = 1);

    if ((($a = (typeof(Math.sinh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.sinh = function(x) {
        return (Math.exp(x) - Math.exp(-x)) / 2;
      }
    
    };

    Opal.defn(self, '$sinh', TMP_26 = function $$sinh(x) {
      var self = this;

      return $scope.get('Math').$checked("sinh", $scope.get('Math')['$float!'](x));
    }, TMP_26.$$arity = 1);

    Opal.defn(self, '$sqrt', TMP_27 = function $$sqrt(x) {
      var self = this;

      return $scope.get('Math').$checked("sqrt", $scope.get('Math')['$float!'](x));
    }, TMP_27.$$arity = 1);

    Opal.defn(self, '$tan', TMP_28 = function $$tan(x) {
      var $a, self = this;

      x = $scope.get('Math')['$float!'](x);
      if ((($a = x['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($scope.get('Float')).$$scope.get('NAN'))};
      return $scope.get('Math').$checked("tan", $scope.get('Math')['$float!'](x));
    }, TMP_28.$$arity = 1);

    if ((($a = (typeof(Math.tanh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.tanh = function(x) {
        if (x == Infinity) {
          return 1;
        }
        else if (x == -Infinity) {
          return -1;
        }
        else {
          return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
        }
      }
    
    };

    Opal.defn(self, '$tanh', TMP_29 = function $$tanh(x) {
      var self = this;

      return $scope.get('Math').$checked("tanh", $scope.get('Math')['$float!'](x));
    }, TMP_29.$$arity = 1);
  })($scope.base)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/complex"] = function(Opal) {
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$===', '$real?', '$raise', '$new', '$*', '$cos', '$sin', '$attr_reader', '$class', '$==', '$real', '$imag', '$Complex', '$-@', '$+', '$__coerced__', '$-', '$nan?', '$/', '$conj', '$abs2', '$quo', '$polar', '$exp', '$log', '$>', '$!=', '$divmod', '$**', '$hypot', '$atan2', '$lcm', '$denominator', '$to_s', '$numerator', '$abs', '$arg', '$rationalize', '$to_f', '$to_i', '$to_r', '$inspect', '$positive?', '$infinite?']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Complex(){};
    var self = $Complex = $klass($base, $super, 'Complex', $Complex);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29;

    def.real = def.imag = nil;
    Opal.defs(self, '$rect', TMP_1 = function $$rect(real, imag) {
      var $a, $b, $c, $d, self = this;

      if (imag == null) {
        imag = 0;
      }
      if ((($a = ($b = ($c = ($d = $scope.get('Numeric')['$==='](real), $d !== false && $d !== nil && $d != null ?real['$real?']() : $d), $c !== false && $c !== nil && $c != null ?$scope.get('Numeric')['$==='](imag) : $c), $b !== false && $b !== nil && $b != null ?imag['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not a real")
      };
      return self.$new(real, imag);
    }, TMP_1.$$arity = -2);

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      return Opal.alias(self, 'rectangular', 'rect')
    })(Opal.get_singleton_class(self));

    Opal.defs(self, '$polar', TMP_2 = function $$polar(r, theta) {
      var $a, $b, $c, $d, self = this;

      if (theta == null) {
        theta = 0;
      }
      if ((($a = ($b = ($c = ($d = $scope.get('Numeric')['$==='](r), $d !== false && $d !== nil && $d != null ?r['$real?']() : $d), $c !== false && $c !== nil && $c != null ?$scope.get('Numeric')['$==='](theta) : $c), $b !== false && $b !== nil && $b != null ?theta['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not a real")
      };
      return self.$new($rb_times(r, $scope.get('Math').$cos(theta)), $rb_times(r, $scope.get('Math').$sin(theta)));
    }, TMP_2.$$arity = -2);

    self.$attr_reader("real", "imag");

    Opal.defn(self, '$initialize', TMP_3 = function $$initialize(real, imag) {
      var self = this;

      if (imag == null) {
        imag = 0;
      }
      self.real = real;
      return self.imag = imag;
    }, TMP_3.$$arity = -2);

    Opal.defn(self, '$coerce', TMP_4 = function $$coerce(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [other, self]
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [$scope.get('Complex').$new(other, 0), self]
        } else {
        return self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerced into Complex")
      };
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$==', TMP_5 = function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other.$real())) ? self.imag['$=='](other.$imag()) : self.real['$=='](other.$real()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other)) ? self.imag['$=='](0) : self.real['$=='](other))
        } else {
        return other['$=='](self)
      };
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$-@', TMP_6 = function() {
      var self = this;

      return self.$Complex(self.real['$-@'](), self.imag['$-@']());
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$+', TMP_7 = function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other.$real()), $rb_plus(self.imag, other.$imag()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("+", other)
      };
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$-', TMP_8 = function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other.$real()), $rb_minus(self.imag, other.$imag()))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("-", other)
      };
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$*', TMP_9 = function(other) {
      var $a, $b, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus($rb_times(self.real, other.$real()), $rb_times(self.imag, other.$imag())), $rb_plus($rb_times(self.real, other.$imag()), $rb_times(self.imag, other.$real())))
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_times(self.real, other), $rb_times(self.imag, other))
        } else {
        return self.$__coerced__("*", other)
      };
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$/', TMP_10 = function(other) {
      var $a, $b, $c, $d, $e, self = this;

      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = ((($c = ((($d = (($e = $scope.get('Number')['$==='](self.real), $e !== false && $e !== nil && $e != null ?self.real['$nan?']() : $e))) !== false && $d !== nil && $d != null) ? $d : (($e = $scope.get('Number')['$==='](self.imag), $e !== false && $e !== nil && $e != null ?self.imag['$nan?']() : $e)))) !== false && $c !== nil && $c != null) ? $c : (($d = $scope.get('Number')['$==='](other.$real()), $d !== false && $d !== nil && $d != null ?other.$real()['$nan?']() : $d)))) !== false && $b !== nil && $b != null) ? $b : (($c = $scope.get('Number')['$==='](other.$imag()), $c !== false && $c !== nil && $c != null ?other.$imag()['$nan?']() : $c)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return $scope.get('Complex').$new((($scope.get('Float')).$$scope.get('NAN')), (($scope.get('Float')).$$scope.get('NAN')))
          } else {
          return $rb_divide($rb_times(self, other.$conj()), other.$abs2())
        }
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex(self.real.$quo(other), self.imag.$quo(other))
        } else {
        return self.$__coerced__("/", other)
      };
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$**', TMP_11 = function(other) {
      var $a, $b, $c, $d, $e, self = this, r = nil, theta = nil, ore = nil, oim = nil, nr = nil, ntheta = nil, x = nil, z = nil, n = nil, div = nil, mod = nil;

      if (other['$=='](0)) {
        return $scope.get('Complex').$new(1, 0)};
      if ((($a = $scope.get('Complex')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $b = self.$polar(), $a = Opal.to_ary($b), r = ($a[0] == null ? nil : $a[0]), theta = ($a[1] == null ? nil : $a[1]), $b;
        ore = other.$real();
        oim = other.$imag();
        nr = $scope.get('Math').$exp($rb_minus($rb_times(ore, $scope.get('Math').$log(r)), $rb_times(oim, theta)));
        ntheta = $rb_plus($rb_times(theta, ore), $rb_times(oim, $scope.get('Math').$log(r)));
        return $scope.get('Complex').$polar(nr, ntheta);
      } else if ((($a = $scope.get('Integer')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_gt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          x = self;
          z = x;
          n = $rb_minus(other, 1);
          while ((($b = n['$!='](0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          while ((($c = ($e = n.$divmod(2), $d = Opal.to_ary($e), div = ($d[0] == null ? nil : $d[0]), mod = ($d[1] == null ? nil : $d[1]), $e, mod['$=='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          x = self.$Complex($rb_minus($rb_times(x.$real(), x.$real()), $rb_times(x.$imag(), x.$imag())), $rb_times($rb_times(2, x.$real()), x.$imag()));
          n = div;};
          z = $rb_times(z, x);
          n = $rb_minus(n, 1);};
          return z;
          } else {
          return ($rb_divide($scope.get('Rational').$new(1, 1), self))['$**'](other['$-@']())
        }
      } else if ((($a = ((($b = $scope.get('Float')['$==='](other)) !== false && $b !== nil && $b != null) ? $b : $scope.get('Rational')['$==='](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $b = self.$polar(), $a = Opal.to_ary($b), r = ($a[0] == null ? nil : $a[0]), theta = ($a[1] == null ? nil : $a[1]), $b;
        return $scope.get('Complex').$polar(r['$**'](other), $rb_times(theta, other));
        } else {
        return self.$__coerced__("**", other)
      };
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$abs', TMP_12 = function $$abs() {
      var self = this;

      return $scope.get('Math').$hypot(self.real, self.imag);
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$abs2', TMP_13 = function $$abs2() {
      var self = this;

      return $rb_plus($rb_times(self.real, self.real), $rb_times(self.imag, self.imag));
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$angle', TMP_14 = function $$angle() {
      var self = this;

      return $scope.get('Math').$atan2(self.imag, self.real);
    }, TMP_14.$$arity = 0);

    Opal.alias(self, 'arg', 'angle');

    Opal.defn(self, '$conj', TMP_15 = function $$conj() {
      var self = this;

      return self.$Complex(self.real, self.imag['$-@']());
    }, TMP_15.$$arity = 0);

    Opal.alias(self, 'conjugate', 'conj');

    Opal.defn(self, '$denominator', TMP_16 = function $$denominator() {
      var self = this;

      return self.real.$denominator().$lcm(self.imag.$denominator());
    }, TMP_16.$$arity = 0);

    Opal.alias(self, 'divide', '/');

    Opal.defn(self, '$eql?', TMP_17 = function(other) {
      var $a, $b, self = this;

      return ($a = ($b = $scope.get('Complex')['$==='](other), $b !== false && $b !== nil && $b != null ?self.real.$class()['$=='](self.imag.$class()) : $b), $a !== false && $a !== nil && $a != null ?self['$=='](other) : $a);
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$fdiv', TMP_18 = function $$fdiv(other) {
      var $a, self = this;

      if ((($a = $scope.get('Numeric')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "" + (other.$class()) + " can't be coerced into Complex")
      };
      return $rb_divide(self, other);
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$hash', TMP_19 = function $$hash() {
      var self = this;

      return "Complex:" + (self.real) + ":" + (self.imag);
    }, TMP_19.$$arity = 0);

    Opal.alias(self, 'imaginary', 'imag');

    Opal.defn(self, '$inspect', TMP_20 = function $$inspect() {
      var self = this;

      return "(" + (self.$to_s()) + ")";
    }, TMP_20.$$arity = 0);

    Opal.alias(self, 'magnitude', 'abs');

    Opal.defn(self, '$numerator', TMP_21 = function $$numerator() {
      var self = this, d = nil;

      d = self.$denominator();
      return self.$Complex($rb_times(self.real.$numerator(), ($rb_divide(d, self.real.$denominator()))), $rb_times(self.imag.$numerator(), ($rb_divide(d, self.imag.$denominator()))));
    }, TMP_21.$$arity = 0);

    Opal.alias(self, 'phase', 'arg');

    Opal.defn(self, '$polar', TMP_22 = function $$polar() {
      var self = this;

      return [self.$abs(), self.$arg()];
    }, TMP_22.$$arity = 0);

    Opal.alias(self, 'quo', '/');

    Opal.defn(self, '$rationalize', TMP_23 = function $$rationalize(eps) {
      var $a, self = this;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = self.imag['$!='](0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('RangeError'), "can't' convert " + (self) + " into Rational")};
      return self.$real().$rationalize(eps);
    }, TMP_23.$$arity = -1);

    Opal.defn(self, '$real?', TMP_24 = function() {
      var self = this;

      return false;
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$rect', TMP_25 = function $$rect() {
      var self = this;

      return [self.real, self.imag];
    }, TMP_25.$$arity = 0);

    Opal.alias(self, 'rectangular', 'rect');

    Opal.defn(self, '$to_f', TMP_26 = function $$to_f() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Float")
      };
      return self.real.$to_f();
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_27 = function $$to_i() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Integer")
      };
      return self.real.$to_i();
    }, TMP_27.$$arity = 0);

    Opal.defn(self, '$to_r', TMP_28 = function $$to_r() {
      var self = this;

      if (self.imag['$=='](0)) {
        } else {
        self.$raise($scope.get('RangeError'), "can't convert " + (self) + " into Rational")
      };
      return self.real.$to_r();
    }, TMP_28.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_29 = function $$to_s() {
      var $a, $b, $c, self = this, result = nil;

      result = self.real.$inspect();
      if ((($a = ((($b = (($c = $scope.get('Number')['$==='](self.imag), $c !== false && $c !== nil && $c != null ?self.imag['$nan?']() : $c))) !== false && $b !== nil && $b != null) ? $b : self.imag['$positive?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, "+")
        } else {
        result = $rb_plus(result, "-")
      };
      result = $rb_plus(result, self.imag.$abs().$inspect());
      if ((($a = ($b = $scope.get('Number')['$==='](self.imag), $b !== false && $b !== nil && $b != null ?(((($c = self.imag['$nan?']()) !== false && $c !== nil && $c != null) ? $c : self.imag['$infinite?']())) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, "*")};
      return $rb_plus(result, "i");
    }, TMP_29.$$arity = 0);

    return Opal.cdecl($scope, 'I', self.$new(0, 1));
  })($scope.base, $scope.get('Numeric'));
  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_30;

    Opal.defn(self, '$Complex', TMP_30 = function $$Complex(real, imag) {
      var self = this;

      if (imag == null) {
        imag = nil;
      }
      if (imag !== false && imag !== nil && imag != null) {
        return $scope.get('Complex').$new(real, imag)
        } else {
        return $scope.get('Complex').$new(real, 0)
      };
    }, TMP_30.$$arity = -2)
  })($scope.base);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/rational"] = function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$to_i', '$==', '$raise', '$<', '$-@', '$new', '$gcd', '$/', '$nil?', '$===', '$reduce', '$to_r', '$equal?', '$!', '$coerce_to!', '$attr_reader', '$to_f', '$numerator', '$denominator', '$<=>', '$-', '$*', '$__coerced__', '$+', '$Rational', '$>', '$**', '$abs', '$ceil', '$with_precision', '$floor', '$to_s', '$<=', '$truncate', '$send', '$convert']);
  self.$require("corelib/numeric");
  (function($base, $super) {
    function $Rational(){};
    var self = $Rational = $klass($base, $super, 'Rational', $Rational);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26;

    def.num = def.den = nil;
    Opal.defs(self, '$reduce', TMP_1 = function $$reduce(num, den) {
      var $a, self = this, gcd = nil;

      num = num.$to_i();
      den = den.$to_i();
      if (den['$=='](0)) {
        self.$raise($scope.get('ZeroDivisionError'), "divided by 0")
      } else if ((($a = $rb_lt(den, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        num = num['$-@']();
        den = den['$-@']();
      } else if (den['$=='](1)) {
        return self.$new(num, den)};
      gcd = num.$gcd(den);
      return self.$new($rb_divide(num, gcd), $rb_divide(den, gcd));
    }, TMP_1.$$arity = 2);

    Opal.defs(self, '$convert', TMP_2 = function $$convert(num, den) {
      var $a, $b, $c, self = this;

      if ((($a = ((($b = num['$nil?']()) !== false && $b !== nil && $b != null) ? $b : den['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('TypeError'), "cannot convert nil into Rational")};
      if ((($a = ($b = $scope.get('Integer')['$==='](num), $b !== false && $b !== nil && $b != null ?$scope.get('Integer')['$==='](den) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$reduce(num, den)};
      if ((($a = ((($b = ((($c = $scope.get('Float')['$==='](num)) !== false && $c !== nil && $c != null) ? $c : $scope.get('String')['$==='](num))) !== false && $b !== nil && $b != null) ? $b : $scope.get('Complex')['$==='](num))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        num = num.$to_r()};
      if ((($a = ((($b = ((($c = $scope.get('Float')['$==='](den)) !== false && $c !== nil && $c != null) ? $c : $scope.get('String')['$==='](den))) !== false && $b !== nil && $b != null) ? $b : $scope.get('Complex')['$==='](den))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        den = den.$to_r()};
      if ((($a = ($b = den['$equal?'](1), $b !== false && $b !== nil && $b != null ?($scope.get('Integer')['$==='](num))['$!']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Opal')['$coerce_to!'](num, $scope.get('Rational'), "to_r")
      } else if ((($a = ($b = $scope.get('Numeric')['$==='](num), $b !== false && $b !== nil && $b != null ?$scope.get('Numeric')['$==='](den) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $rb_divide(num, den)
        } else {
        return self.$reduce(num, den)
      };
    }, TMP_2.$$arity = 2);

    self.$attr_reader("numerator", "denominator");

    Opal.defn(self, '$initialize', TMP_3 = function $$initialize(num, den) {
      var self = this;

      self.num = num;
      return self.den = den;
    }, TMP_3.$$arity = 2);

    Opal.defn(self, '$numerator', TMP_4 = function $$numerator() {
      var self = this;

      return self.num;
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$denominator', TMP_5 = function $$denominator() {
      var self = this;

      return self.den;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$coerce', TMP_6 = function $$coerce(other) {
      var self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return [other, self]}else if ($scope.get('Integer')['$===']($case)) {return [other.$to_r(), self]}else if ($scope.get('Float')['$===']($case)) {return [other, self.$to_f()]}else { return nil }})();
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$==', TMP_7 = function(other) {
      var $a, self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return (($a = self.num['$=='](other.$numerator())) ? self.den['$=='](other.$denominator()) : self.num['$=='](other.$numerator()))}else if ($scope.get('Integer')['$===']($case)) {return (($a = self.num['$=='](other)) ? self.den['$=='](1) : self.num['$=='](other))}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$=='](other)}else {return other['$=='](self)}})();
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_8 = function(other) {
      var self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {return $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()))['$<=>'](0)}else if ($scope.get('Integer')['$===']($case)) {return $rb_minus(self.num, $rb_times(self.den, other))['$<=>'](0)}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$<=>'](other)}else {return self.$__coerced__("<=>", other)}})();
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$+', TMP_9 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_plus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_plus(self.num, $rb_times(other, self.den)), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_plus(self.$to_f(), other)}else {return self.$__coerced__("+", other)}})();
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$-', TMP_10 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_minus(self.num, $rb_times(other, self.den)), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_minus(self.$to_f(), other)}else {return self.$__coerced__("-", other)}})();
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$*', TMP_11 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_times(self.num, other.$numerator());
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {return self.$Rational($rb_times(self.num, other), self.den)}else if ($scope.get('Float')['$===']($case)) {return $rb_times(self.$to_f(), other)}else {return self.$__coerced__("*", other)}})();
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$/', TMP_12 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;if ($scope.get('Rational')['$===']($case)) {num = $rb_times(self.num, other.$denominator());
      den = $rb_times(self.den, other.$numerator());
      return self.$Rational(num, den);}else if ($scope.get('Integer')['$===']($case)) {if (other['$=='](0)) {
        return $rb_divide(self.$to_f(), 0.0)
        } else {
        return self.$Rational(self.num, $rb_times(self.den, other))
      }}else if ($scope.get('Float')['$===']($case)) {return $rb_divide(self.$to_f(), other)}else {return self.$__coerced__("/", other)}})();
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$**', TMP_13 = function(other) {
      var $a, $b, self = this, $case = nil;

      return (function() {$case = other;if ($scope.get('Integer')['$===']($case)) {if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($scope.get('Float')).$$scope.get('INFINITY'))
      } else if ((($a = $rb_gt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.num['$**'](other), self.den['$**'](other))
      } else if ((($a = $rb_lt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.den['$**'](other['$-@']()), self.num['$**'](other['$-@']()))
        } else {
        return self.$Rational(1, 1)
      }}else if ($scope.get('Float')['$===']($case)) {return self.$to_f()['$**'](other)}else if ($scope.get('Rational')['$===']($case)) {if (other['$=='](0)) {
        return self.$Rational(1, 1)
      } else if (other.$denominator()['$=='](1)) {
        if ((($a = $rb_lt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$Rational(self.den['$**'](other.$numerator().$abs()), self.num['$**'](other.$numerator().$abs()))
          } else {
          return self.$Rational(self.num['$**'](other.$numerator()), self.den['$**'](other.$numerator()))
        }
      } else if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise($scope.get('ZeroDivisionError'), "divided by 0")
        } else {
        return self.$to_f()['$**'](other)
      }}else {return self.$__coerced__("**", other)}})();
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$abs', TMP_14 = function $$abs() {
      var self = this;

      return self.$Rational(self.num.$abs(), self.den.$abs());
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$ceil', TMP_15 = function $$ceil(precision) {
      var self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        return (($rb_divide(self.num['$-@'](), self.den))['$-@']()).$ceil()
        } else {
        return self.$with_precision("ceil", precision)
      };
    }, TMP_15.$$arity = -1);

    Opal.alias(self, 'divide', '/');

    Opal.defn(self, '$floor', TMP_16 = function $$floor(precision) {
      var self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        return (($rb_divide(self.num['$-@'](), self.den))['$-@']()).$floor()
        } else {
        return self.$with_precision("floor", precision)
      };
    }, TMP_16.$$arity = -1);

    Opal.defn(self, '$hash', TMP_17 = function $$hash() {
      var self = this;

      return "Rational:" + (self.num) + ":" + (self.den);
    }, TMP_17.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_18 = function $$inspect() {
      var self = this;

      return "(" + (self.$to_s()) + ")";
    }, TMP_18.$$arity = 0);

    Opal.alias(self, 'quo', '/');

    Opal.defn(self, '$rationalize', TMP_19 = function $$rationalize(eps) {
      var self = this;

      
      if (arguments.length > 1) {
        self.$raise($scope.get('ArgumentError'), "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }

      if (eps == null) {
        return self;
      }

      var e = eps.$abs(),
          a = $rb_minus(self, e),
          b = $rb_plus(self, e);

      var p0 = 0,
          p1 = 1,
          q0 = 1,
          q1 = 0,
          p2, q2;

      var c, k, t;

      while (true) {
        c = (a).$ceil();

        if ($rb_le(c, b)) {
          break;
        }

        k  = c - 1;
        p2 = k * p1 + p0;
        q2 = k * q1 + q0;
        t  = $rb_divide(1, ($rb_minus(b, k)));
        b  = $rb_divide(1, ($rb_minus(a, k)));
        a  = t;

        p0 = p1;
        q0 = q1;
        p1 = p2;
        q1 = q2;
      }

      return self.$Rational(c * p1 + p0, c * q1 + q0);
    ;
    }, TMP_19.$$arity = -1);

    Opal.defn(self, '$round', TMP_20 = function $$round(precision) {
      var $a, self = this, num = nil, den = nil, approx = nil;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        } else {
        return self.$with_precision("round", precision)
      };
      if (self.num['$=='](0)) {
        return 0};
      if (self.den['$=='](1)) {
        return self.num};
      num = $rb_plus($rb_times(self.num.$abs(), 2), self.den);
      den = $rb_times(self.den, 2);
      approx = ($rb_divide(num, den)).$truncate();
      if ((($a = $rb_lt(self.num, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return approx['$-@']()
        } else {
        return approx
      };
    }, TMP_20.$$arity = -1);

    Opal.defn(self, '$to_f', TMP_21 = function $$to_f() {
      var self = this;

      return $rb_divide(self.num, self.den);
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_22 = function $$to_i() {
      var self = this;

      return self.$truncate();
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$to_r', TMP_23 = function $$to_r() {
      var self = this;

      return self;
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$to_s', TMP_24 = function $$to_s() {
      var self = this;

      return "" + (self.num) + "/" + (self.den);
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$truncate', TMP_25 = function $$truncate(precision) {
      var $a, self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        if ((($a = $rb_lt(self.num, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$ceil()
          } else {
          return self.$floor()
        }
        } else {
        return self.$with_precision("truncate", precision)
      };
    }, TMP_25.$$arity = -1);

    return (Opal.defn(self, '$with_precision', TMP_26 = function $$with_precision(method, precision) {
      var $a, self = this, p = nil, s = nil;

      if ((($a = $scope.get('Integer')['$==='](precision)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('TypeError'), "not an Integer")
      };
      p = (10)['$**'](precision);
      s = $rb_times(self, p);
      if ((($a = $rb_lt(precision, 1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ($rb_divide(s.$send(method), p)).$to_i()
        } else {
        return self.$Rational(s.$send(method), p)
      };
    }, TMP_26.$$arity = 2), nil) && 'with_precision';
  })($scope.base, $scope.get('Numeric'));
  return (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_27;

    Opal.defn(self, '$Rational', TMP_27 = function $$Rational(numerator, denominator) {
      var self = this;

      if (denominator == null) {
        denominator = 1;
      }
      return $scope.get('Rational').$convert(numerator, denominator);
    }, TMP_27.$$arity = -2)
  })($scope.base);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/time"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range;

  Opal.add_stubs(['$require', '$include', '$===', '$raise', '$coerce_to!', '$respond_to?', '$to_str', '$to_i', '$new', '$<=>', '$to_f', '$nil?', '$>', '$<', '$strftime', '$year', '$month', '$day', '$+', '$round', '$/', '$-', '$copy_instance_variables', '$initialize_dup', '$is_a?', '$zero?', '$wday', '$utc?', '$mon', '$yday', '$hour', '$min', '$sec', '$rjust', '$ljust', '$zone', '$to_s', '$[]', '$cweek_cyear', '$isdst', '$<=', '$!=', '$==', '$ceil']);
  self.$require("corelib/comparable");
  return (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42;

    self.$include($scope.get('Comparable'));

    
    var days_of_week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        short_days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        long_months  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  ;

    Opal.defs(self, '$at', TMP_1 = function $$at(seconds, frac) {
      var self = this;

      
      var result;

      if ($scope.get('Time')['$==='](seconds)) {
        if (frac !== undefined) {
          self.$raise($scope.get('TypeError'), "can't convert Time into an exact number")
        }
        result = new Date(seconds.getTime());
        result.is_utc = seconds.is_utc;
        return result;
      }

      if (!seconds.$$is_number) {
        seconds = $scope.get('Opal')['$coerce_to!'](seconds, $scope.get('Integer'), "to_int");
      }

      if (frac === undefined) {
        return new Date(seconds * 1000);
      }

      if (!frac.$$is_number) {
        frac = $scope.get('Opal')['$coerce_to!'](frac, $scope.get('Integer'), "to_int");
      }

      return new Date(seconds * 1000 + (frac / 1000));
    ;
    }, TMP_1.$$arity = -2);

    
    function time_params(year, month, day, hour, min, sec) {
      if (year.$$is_string) {
        year = parseInt(year, 10);
      } else {
        year = $scope.get('Opal')['$coerce_to!'](year, $scope.get('Integer'), "to_int");
      }

      if (month === nil) {
        month = 1;
      } else if (!month.$$is_number) {
        if ((month)['$respond_to?']("to_str")) {
          month = (month).$to_str();
          switch (month.toLowerCase()) {
          case 'jan': month =  1; break;
          case 'feb': month =  2; break;
          case 'mar': month =  3; break;
          case 'apr': month =  4; break;
          case 'may': month =  5; break;
          case 'jun': month =  6; break;
          case 'jul': month =  7; break;
          case 'aug': month =  8; break;
          case 'sep': month =  9; break;
          case 'oct': month = 10; break;
          case 'nov': month = 11; break;
          case 'dec': month = 12; break;
          default: month = (month).$to_i();
          }
        } else {
          month = $scope.get('Opal')['$coerce_to!'](month, $scope.get('Integer'), "to_int");
        }
      }

      if (month < 1 || month > 12) {
        self.$raise($scope.get('ArgumentError'), "month out of range: " + (month))
      }
      month = month - 1;

      if (day === nil) {
        day = 1;
      } else if (day.$$is_string) {
        day = parseInt(day, 10);
      } else {
        day = $scope.get('Opal')['$coerce_to!'](day, $scope.get('Integer'), "to_int");
      }

      if (day < 1 || day > 31) {
        self.$raise($scope.get('ArgumentError'), "day out of range: " + (day))
      }

      if (hour === nil) {
        hour = 0;
      } else if (hour.$$is_string) {
        hour = parseInt(hour, 10);
      } else {
        hour = $scope.get('Opal')['$coerce_to!'](hour, $scope.get('Integer'), "to_int");
      }

      if (hour < 0 || hour > 24) {
        self.$raise($scope.get('ArgumentError'), "hour out of range: " + (hour))
      }

      if (min === nil) {
        min = 0;
      } else if (min.$$is_string) {
        min = parseInt(min, 10);
      } else {
        min = $scope.get('Opal')['$coerce_to!'](min, $scope.get('Integer'), "to_int");
      }

      if (min < 0 || min > 59) {
        self.$raise($scope.get('ArgumentError'), "min out of range: " + (min))
      }

      if (sec === nil) {
        sec = 0;
      } else if (!sec.$$is_number) {
        if (sec.$$is_string) {
          sec = parseInt(sec, 10);
        } else {
          sec = $scope.get('Opal')['$coerce_to!'](sec, $scope.get('Integer'), "to_int");
        }
      }

      if (sec < 0 || sec > 60) {
        self.$raise($scope.get('ArgumentError'), "sec out of range: " + (sec))
      }

      return [year, month, day, hour, min, sec];
    }
  ;

    Opal.defs(self, '$new', TMP_2 = function(year, month, day, hour, min, sec, utc_offset) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (utc_offset == null) {
        utc_offset = nil;
      }
      
      var args, result;

      if (year === undefined) {
        return new Date();
      }

      if (utc_offset !== nil) {
        self.$raise($scope.get('ArgumentError'), "Opal does not support explicitly specifying UTC offset for Time")
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    }, TMP_2.$$arity = -1);

    Opal.defs(self, '$local', TMP_3 = function $$local(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (millisecond == null) {
        millisecond = nil;
      }
      if (_dummy1 == null) {
        _dummy1 = nil;
      }
      if (_dummy2 == null) {
        _dummy2 = nil;
      }
      if (_dummy3 == null) {
        _dummy3 = nil;
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    }, TMP_3.$$arity = -2);

    Opal.defs(self, '$gm', TMP_4 = function $$gm(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (millisecond == null) {
        millisecond = nil;
      }
      if (_dummy1 == null) {
        _dummy1 = nil;
      }
      if (_dummy2 == null) {
        _dummy2 = nil;
      }
      if (_dummy3 == null) {
        _dummy3 = nil;
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(Date.UTC(year, month, day, hour, min, 0, sec * 1000));
      if (year < 100) {
        result.setUTCFullYear(year);
      }
      result.is_utc = true;
      return result;
    
    }, TMP_4.$$arity = -2);

    (function(self) {
      var $scope = self.$$scope, def = self.$$proto;

      Opal.alias(self, 'mktime', 'local');
      return Opal.alias(self, 'utc', 'gm');
    })(Opal.get_singleton_class(self));

    Opal.defs(self, '$now', TMP_5 = function $$now() {
      var self = this;

      return self.$new();
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$+', TMP_6 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise($scope.get('TypeError'), "time + time?")};
      
      if (!other.$$is_number) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Integer'), "to_int");
      }
      var result = new Date(self.getTime() + (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    }, TMP_6.$$arity = 1);

    Opal.defn(self, '$-', TMP_7 = function(other) {
      var $a, self = this;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (self.getTime() - other.getTime()) / 1000};
      
      if (!other.$$is_number) {
        other = $scope.get('Opal')['$coerce_to!'](other, $scope.get('Integer'), "to_int");
      }
      var result = new Date(self.getTime() - (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$<=>', TMP_8 = function(other) {
      var $a, self = this, r = nil;

      if ((($a = $scope.get('Time')['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$to_f()['$<=>'](other.$to_f())
        } else {
        r = other['$<=>'](self);
        if ((($a = r['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil
        } else if ((($a = $rb_gt(r, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return -1
        } else if ((($a = $rb_lt(r, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return 1
          } else {
          return 0
        };
      };
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$==', TMP_9 = function(other) {
      var self = this;

      return self.$to_f() === other.$to_f();
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$asctime', TMP_10 = function $$asctime() {
      var self = this;

      return self.$strftime("%a %b %e %H:%M:%S %Y");
    }, TMP_10.$$arity = 0);

    Opal.alias(self, 'ctime', 'asctime');

    Opal.defn(self, '$day', TMP_11 = function $$day() {
      var self = this;

      return self.is_utc ? self.getUTCDate() : self.getDate();
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$yday', TMP_12 = function $$yday() {
      var self = this, start_of_year = nil, start_of_day = nil, one_day = nil;

      start_of_year = $scope.get('Time').$new(self.$year()).$to_i();
      start_of_day = $scope.get('Time').$new(self.$year(), self.$month(), self.$day()).$to_i();
      one_day = 86400;
      return $rb_plus(($rb_divide(($rb_minus(start_of_day, start_of_year)), one_day)).$round(), 1);
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$isdst', TMP_13 = function $$isdst() {
      var self = this;

      
      var jan = new Date(self.getFullYear(), 0, 1),
          jul = new Date(self.getFullYear(), 6, 1);
      return self.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    
    }, TMP_13.$$arity = 0);

    Opal.alias(self, 'dst?', 'isdst');

    Opal.defn(self, '$dup', TMP_14 = function $$dup() {
      var self = this, copy = nil;

      copy = new Date(self.getTime());
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$eql?', TMP_15 = function(other) {
      var $a, self = this;

      return ($a = other['$is_a?']($scope.get('Time')), $a !== false && $a !== nil && $a != null ?(self['$<=>'](other))['$zero?']() : $a);
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$friday?', TMP_16 = function() {
      var self = this;

      return self.$wday() == 5;
    }, TMP_16.$$arity = 0);

    Opal.defn(self, '$hash', TMP_17 = function $$hash() {
      var self = this;

      return 'Time:' + self.getTime();
    }, TMP_17.$$arity = 0);

    Opal.defn(self, '$hour', TMP_18 = function $$hour() {
      var self = this;

      return self.is_utc ? self.getUTCHours() : self.getHours();
    }, TMP_18.$$arity = 0);

    Opal.defn(self, '$inspect', TMP_19 = function $$inspect() {
      var $a, self = this;

      if ((($a = self['$utc?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$strftime("%Y-%m-%d %H:%M:%S UTC")
        } else {
        return self.$strftime("%Y-%m-%d %H:%M:%S %z")
      };
    }, TMP_19.$$arity = 0);

    Opal.alias(self, 'mday', 'day');

    Opal.defn(self, '$min', TMP_20 = function $$min() {
      var self = this;

      return self.is_utc ? self.getUTCMinutes() : self.getMinutes();
    }, TMP_20.$$arity = 0);

    Opal.defn(self, '$mon', TMP_21 = function $$mon() {
      var self = this;

      return (self.is_utc ? self.getUTCMonth() : self.getMonth()) + 1;
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$monday?', TMP_22 = function() {
      var self = this;

      return self.$wday() == 1;
    }, TMP_22.$$arity = 0);

    Opal.alias(self, 'month', 'mon');

    Opal.defn(self, '$saturday?', TMP_23 = function() {
      var self = this;

      return self.$wday() == 6;
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$sec', TMP_24 = function $$sec() {
      var self = this;

      return self.is_utc ? self.getUTCSeconds() : self.getSeconds();
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$succ', TMP_25 = function $$succ() {
      var self = this;

      
      var result = new Date(self.getTime() + 1000);
      result.is_utc = self.is_utc;
      return result;
    
    }, TMP_25.$$arity = 0);

    Opal.defn(self, '$usec', TMP_26 = function $$usec() {
      var self = this;

      return self.getMilliseconds() * 1000;
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$zone', TMP_27 = function $$zone() {
      var self = this;

      
      var string = self.toString(),
          result;

      if (string.indexOf('(') == -1) {
        result = string.match(/[A-Z]{3,4}/)[0];
      }
      else {
        result = string.match(/\((.+)\)(?:\s|$)/)[1]
      }

      if (result == "GMT" && /(GMT\W*\d{4})/.test(string)) {
        return RegExp.$1;
      }
      else {
        return result;
      }
    
    }, TMP_27.$$arity = 0);

    Opal.defn(self, '$getgm', TMP_28 = function $$getgm() {
      var self = this;

      
      var result = new Date(self.getTime());
      result.is_utc = true;
      return result;
    
    }, TMP_28.$$arity = 0);

    Opal.alias(self, 'getutc', 'getgm');

    Opal.defn(self, '$gmtime', TMP_29 = function $$gmtime() {
      var self = this;

      
      self.is_utc = true;
      return self;
    
    }, TMP_29.$$arity = 0);

    Opal.alias(self, 'utc', 'gmtime');

    Opal.defn(self, '$gmt?', TMP_30 = function() {
      var self = this;

      return self.is_utc === true;
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$gmt_offset', TMP_31 = function $$gmt_offset() {
      var self = this;

      return -self.getTimezoneOffset() * 60;
    }, TMP_31.$$arity = 0);

    Opal.defn(self, '$strftime', TMP_32 = function $$strftime(format) {
      var self = this;

      
      return format.replace(/%([\-_#^0]*:{0,2})(\d+)?([EO]*)(.)/g, function(full, flags, width, _, conv) {
        var result = "",
            zero   = flags.indexOf('0') !== -1,
            pad    = flags.indexOf('-') === -1,
            blank  = flags.indexOf('_') !== -1,
            upcase = flags.indexOf('^') !== -1,
            invert = flags.indexOf('#') !== -1,
            colons = (flags.match(':') || []).length;

        width = parseInt(width, 10);

        if (zero && blank) {
          if (flags.indexOf('0') < flags.indexOf('_')) {
            zero = false;
          }
          else {
            blank = false;
          }
        }

        switch (conv) {
          case 'Y':
            result += self.$year();
            break;

          case 'C':
            zero    = !blank;
            result += Math.round(self.$year() / 100);
            break;

          case 'y':
            zero    = !blank;
            result += (self.$year() % 100);
            break;

          case 'm':
            zero    = !blank;
            result += self.$mon();
            break;

          case 'B':
            result += long_months[self.$mon() - 1];
            break;

          case 'b':
          case 'h':
            blank   = !zero;
            result += short_months[self.$mon() - 1];
            break;

          case 'd':
            zero    = !blank
            result += self.$day();
            break;

          case 'e':
            blank   = !zero
            result += self.$day();
            break;

          case 'j':
            result += self.$yday();
            break;

          case 'H':
            zero    = !blank;
            result += self.$hour();
            break;

          case 'k':
            blank   = !zero;
            result += self.$hour();
            break;

          case 'I':
            zero    = !blank;
            result += (self.$hour() % 12 || 12);
            break;

          case 'l':
            blank   = !zero;
            result += (self.$hour() % 12 || 12);
            break;

          case 'P':
            result += (self.$hour() >= 12 ? "pm" : "am");
            break;

          case 'p':
            result += (self.$hour() >= 12 ? "PM" : "AM");
            break;

          case 'M':
            zero    = !blank;
            result += self.$min();
            break;

          case 'S':
            zero    = !blank;
            result += self.$sec()
            break;

          case 'L':
            zero    = !blank;
            width   = isNaN(width) ? 3 : width;
            result += self.getMilliseconds();
            break;

          case 'N':
            width   = isNaN(width) ? 9 : width;
            result += (self.getMilliseconds().toString()).$rjust(3, "0");
            result  = (result).$ljust(width, "0");
            break;

          case 'z':
            var offset  = self.getTimezoneOffset(),
                hours   = Math.floor(Math.abs(offset) / 60),
                minutes = Math.abs(offset) % 60;

            result += offset < 0 ? "+" : "-";
            result += hours < 10 ? "0" : "";
            result += hours;

            if (colons > 0) {
              result += ":";
            }

            result += minutes < 10 ? "0" : "";
            result += minutes;

            if (colons > 1) {
              result += ":00";
            }

            break;

          case 'Z':
            result += self.$zone();
            break;

          case 'A':
            result += days_of_week[self.$wday()];
            break;

          case 'a':
            result += short_days[self.$wday()];
            break;

          case 'u':
            result += (self.$wday() + 1);
            break;

          case 'w':
            result += self.$wday();
            break;

          case 'V':
            result += self.$cweek_cyear()['$[]'](0).$to_s().$rjust(2, "0");
            break;

          case 'G':
            result += self.$cweek_cyear()['$[]'](1);
            break;

          case 'g':
            result += self.$cweek_cyear()['$[]'](1)['$[]']($range(-2, -1, false));
            break;

          case 's':
            result += self.$to_i();
            break;

          case 'n':
            result += "\n";
            break;

          case 't':
            result += "\t";
            break;

          case '%':
            result += "%";
            break;

          case 'c':
            result += self.$strftime("%a %b %e %T %Y");
            break;

          case 'D':
          case 'x':
            result += self.$strftime("%m/%d/%y");
            break;

          case 'F':
            result += self.$strftime("%Y-%m-%d");
            break;

          case 'v':
            result += self.$strftime("%e-%^b-%4Y");
            break;

          case 'r':
            result += self.$strftime("%I:%M:%S %p");
            break;

          case 'R':
            result += self.$strftime("%H:%M");
            break;

          case 'T':
          case 'X':
            result += self.$strftime("%H:%M:%S");
            break;

          default:
            return full;
        }

        if (upcase) {
          result = result.toUpperCase();
        }

        if (invert) {
          result = result.replace(/[A-Z]/, function(c) { c.toLowerCase() }).
                          replace(/[a-z]/, function(c) { c.toUpperCase() });
        }

        if (pad && (zero || blank)) {
          result = (result).$rjust(isNaN(width) ? 2 : width, blank ? " " : "0");
        }

        return result;
      });
    
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$sunday?', TMP_33 = function() {
      var self = this;

      return self.$wday() == 0;
    }, TMP_33.$$arity = 0);

    Opal.defn(self, '$thursday?', TMP_34 = function() {
      var self = this;

      return self.$wday() == 4;
    }, TMP_34.$$arity = 0);

    Opal.defn(self, '$to_a', TMP_35 = function $$to_a() {
      var self = this;

      return [self.$sec(), self.$min(), self.$hour(), self.$day(), self.$month(), self.$year(), self.$wday(), self.$yday(), self.$isdst(), self.$zone()];
    }, TMP_35.$$arity = 0);

    Opal.defn(self, '$to_f', TMP_36 = function $$to_f() {
      var self = this;

      return self.getTime() / 1000;
    }, TMP_36.$$arity = 0);

    Opal.defn(self, '$to_i', TMP_37 = function $$to_i() {
      var self = this;

      return parseInt(self.getTime() / 1000, 10);
    }, TMP_37.$$arity = 0);

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$tuesday?', TMP_38 = function() {
      var self = this;

      return self.$wday() == 2;
    }, TMP_38.$$arity = 0);

    Opal.alias(self, 'tv_sec', 'sec');

    Opal.alias(self, 'tv_usec', 'usec');

    Opal.alias(self, 'utc?', 'gmt?');

    Opal.alias(self, 'gmtoff', 'gmt_offset');

    Opal.alias(self, 'utc_offset', 'gmt_offset');

    Opal.defn(self, '$wday', TMP_39 = function $$wday() {
      var self = this;

      return self.is_utc ? self.getUTCDay() : self.getDay();
    }, TMP_39.$$arity = 0);

    Opal.defn(self, '$wednesday?', TMP_40 = function() {
      var self = this;

      return self.$wday() == 3;
    }, TMP_40.$$arity = 0);

    Opal.defn(self, '$year', TMP_41 = function $$year() {
      var self = this;

      return self.is_utc ? self.getUTCFullYear() : self.getFullYear();
    }, TMP_41.$$arity = 0);

    return (Opal.defn(self, '$cweek_cyear', TMP_42 = function $$cweek_cyear() {
      var $a, $b, self = this, jan01 = nil, jan01_wday = nil, first_monday = nil, year = nil, offset = nil, week = nil, dec31 = nil, dec31_wday = nil;

      jan01 = $scope.get('Time').$new(self.$year(), 1, 1);
      jan01_wday = jan01.$wday();
      first_monday = 0;
      year = self.$year();
      if ((($a = ($b = $rb_le(jan01_wday, 4), $b !== false && $b !== nil && $b != null ?jan01_wday['$!='](0) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        offset = $rb_minus(jan01_wday, 1)
        } else {
        offset = $rb_minus($rb_minus(jan01_wday, 7), 1);
        if (offset['$=='](-8)) {
          offset = -1};
      };
      week = ($rb_divide(($rb_plus(self.$yday(), offset)), 7.0)).$ceil();
      if ((($a = $rb_le(week, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $scope.get('Time').$new($rb_minus(self.$year(), 1), 12, 31).$cweek_cyear()
      } else if (week['$=='](53)) {
        dec31 = $scope.get('Time').$new(self.$year(), 12, 31);
        dec31_wday = dec31.$wday();
        if ((($a = ($b = $rb_le(dec31_wday, 3), $b !== false && $b !== nil && $b != null ?dec31_wday['$!='](0) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          week = 1;
          year = $rb_plus(year, 1);};};
      return [week, year];
    }, TMP_42.$$arity = 0), nil) && 'cweek_cyear';
  })($scope.base, Date);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/struct"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$include', '$const_name!', '$unshift', '$map', '$coerce_to!', '$new', '$each', '$define_struct_attribute', '$allocate', '$initialize', '$module_eval', '$to_proc', '$const_set', '$==', '$raise', '$<<', '$members', '$define_method', '$instance_eval', '$>', '$length', '$class', '$each_with_index', '$[]=', '$[]', '$hash', '$===', '$<', '$-@', '$size', '$>=', '$include?', '$to_sym', '$instance_of?', '$__id__', '$eql?', '$enum_for', '$name', '$+', '$join', '$inspect', '$each_pair', '$inject', '$flatten', '$to_a', '$values_at']);
  self.$require("corelib/enumerable");
  return (function($base, $super) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_8, TMP_9, TMP_11, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_23, TMP_26, TMP_28, TMP_30, TMP_32, TMP_34, TMP_35;

    self.$include($scope.get('Enumerable'));

    Opal.defs(self, '$new', TMP_1 = function(const_name, $a_rest) {
      var $b, $c, TMP_2, $d, TMP_3, $e, self = this, args, $iter = TMP_1.$$p, block = $iter || nil, klass = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_1.$$p = null;
      if (const_name !== false && const_name !== nil && const_name != null) {
        try {
          const_name = $scope.get('Opal')['$const_name!'](const_name)
        } catch ($err) {
          if (Opal.rescue($err, [$scope.get('TypeError'), $scope.get('NameError')])) {
            try {
              args.$unshift(const_name);
              const_name = nil;
            } finally { Opal.pop_exception() }
          } else { throw $err; }
        }};
      ($b = ($c = args).$map, $b.$$p = (TMP_2 = function(arg){var self = TMP_2.$$s || this;
if (arg == null) arg = nil;
      return $scope.get('Opal')['$coerce_to!'](arg, $scope.get('String'), "to_str")}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2), $b).call($c);
      klass = ($b = ($d = $scope.get('Class')).$new, $b.$$p = (TMP_3 = function(){var self = TMP_3.$$s || this, $a, $e, TMP_4;

      ($a = ($e = args).$each, $a.$$p = (TMP_4 = function(arg){var self = TMP_4.$$s || this;
if (arg == null) arg = nil;
        return self.$define_struct_attribute(arg)}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4), $a).call($e);
        return (function(self) {
          var $scope = self.$$scope, def = self.$$proto, TMP_5;

          Opal.defn(self, '$new', TMP_5 = function($a_rest) {
            var $b, self = this, args, instance = nil;

            var $args_len = arguments.length, $rest_len = $args_len - 0;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 0] = arguments[$arg_idx];
            }
            instance = self.$allocate();
            instance.$$data = {};;
            ($b = instance).$initialize.apply($b, Opal.to_a(args));
            return instance;
          }, TMP_5.$$arity = -1);
          return Opal.alias(self, '[]', 'new');
        })(Opal.get_singleton_class(self));}, TMP_3.$$s = self, TMP_3.$$arity = 0, TMP_3), $b).call($d, self);
      if (block !== false && block !== nil && block != null) {
        ($b = ($e = klass).$module_eval, $b.$$p = block.$to_proc(), $b).call($e)};
      if (const_name !== false && const_name !== nil && const_name != null) {
        $scope.get('Struct').$const_set(const_name, klass)};
      return klass;
    }, TMP_1.$$arity = -2);

    Opal.defs(self, '$define_struct_attribute', TMP_8 = function $$define_struct_attribute(name) {
      var $a, $b, TMP_6, $c, TMP_7, self = this;

      if (self['$==']($scope.get('Struct'))) {
        self.$raise($scope.get('ArgumentError'), "you cannot define attributes to the Struct class")};
      self.$members()['$<<'](name);
      ($a = ($b = self).$define_method, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this;

      return self.$$data[name];}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6), $a).call($b, name);
      return ($a = ($c = self).$define_method, $a.$$p = (TMP_7 = function(value){var self = TMP_7.$$s || this;
if (value == null) value = nil;
      return self.$$data[name] = value;}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7), $a).call($c, "" + (name) + "=");
    }, TMP_8.$$arity = 1);

    Opal.defs(self, '$members', TMP_9 = function $$members() {
      var $a, self = this;
      if (self.members == null) self.members = nil;

      if (self['$==']($scope.get('Struct'))) {
        self.$raise($scope.get('ArgumentError'), "the Struct class has no members")};
      return ((($a = self.members) !== false && $a !== nil && $a != null) ? $a : self.members = []);
    }, TMP_9.$$arity = 0);

    Opal.defs(self, '$inherited', TMP_11 = function $$inherited(klass) {
      var $a, $b, TMP_10, self = this, members = nil;
      if (self.members == null) self.members = nil;

      members = self.members;
      return ($a = ($b = klass).$instance_eval, $a.$$p = (TMP_10 = function(){var self = TMP_10.$$s || this;

      return self.members = members}, TMP_10.$$s = self, TMP_10.$$arity = 0, TMP_10), $a).call($b);
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$initialize', TMP_13 = function $$initialize($a_rest) {
      var $b, $c, TMP_12, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      if ((($b = $rb_gt(args.$length(), self.$class().$members().$length())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$raise($scope.get('ArgumentError'), "struct size differs")};
      return ($b = ($c = self.$class().$members()).$each_with_index, $b.$$p = (TMP_12 = function(name, index){var self = TMP_12.$$s || this;
if (name == null) name = nil;if (index == null) index = nil;
      return self['$[]='](name, args['$[]'](index))}, TMP_12.$$s = self, TMP_12.$$arity = 2, TMP_12), $b).call($c);
    }, TMP_13.$$arity = -1);

    Opal.defn(self, '$members', TMP_14 = function $$members() {
      var self = this;

      return self.$class().$members();
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$hash', TMP_15 = function $$hash() {
      var self = this;

      return $scope.get('Hash').$new(self.$$data).$hash();
    }, TMP_15.$$arity = 0);

    Opal.defn(self, '$[]', TMP_16 = function(name) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_lt(name, self.$class().$members().$size()['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too small for struct(size:" + (self.$class().$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$class().$members().$size())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too large for struct(size:" + (self.$class().$members().$size()) + ")")};
        name = self.$class().$members()['$[]'](name);
      } else if ((($a = $scope.get('String')['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if(!self.$$data.hasOwnProperty(name)) {
          self.$raise($scope.get('NameError').$new("no member '" + (name) + "' in struct", name))
        }
      ;
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      return self.$$data[name];
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$[]=', TMP_17 = function(name, value) {
      var $a, self = this;

      if ((($a = $scope.get('Integer')['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_lt(name, self.$class().$members().$size()['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too small for struct(size:" + (self.$class().$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$class().$members().$size())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('IndexError'), "offset " + (name) + " too large for struct(size:" + (self.$class().$members().$size()) + ")")};
        name = self.$class().$members()['$[]'](name);
      } else if ((($a = $scope.get('String')['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.$class().$members()['$include?'](name.$to_sym())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise($scope.get('NameError').$new("no member '" + (name) + "' in struct", name))
        }
        } else {
        self.$raise($scope.get('TypeError'), "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = $scope.get('Opal')['$coerce_to!'](name, $scope.get('String'), "to_str");
      return self.$$data[name] = value;
    }, TMP_17.$$arity = 2);

    Opal.defn(self, '$==', TMP_18 = function(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if ($scope.get('Struct')['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$eql?', TMP_19 = function(other) {
      var $a, self = this;

      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if ($scope.get('Struct')['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    }, TMP_19.$$arity = 1);

    Opal.defn(self, '$each', TMP_20 = function $$each() {
      var $a, $b, TMP_21, $c, TMP_22, self = this, $iter = TMP_20.$$p, $yield = $iter || nil;

      TMP_20.$$p = null;
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_21 = function(){var self = TMP_21.$$s || this;

        return self.$size()}, TMP_21.$$s = self, TMP_21.$$arity = 0, TMP_21), $a).call($b, "each")
      };
      ($a = ($c = self.$class().$members()).$each, $a.$$p = (TMP_22 = function(name){var self = TMP_22.$$s || this;
if (name == null) name = nil;
      return Opal.yield1($yield, self['$[]'](name));}, TMP_22.$$s = self, TMP_22.$$arity = 1, TMP_22), $a).call($c);
      return self;
    }, TMP_20.$$arity = 0);

    Opal.defn(self, '$each_pair', TMP_23 = function $$each_pair() {
      var $a, $b, TMP_24, $c, TMP_25, self = this, $iter = TMP_23.$$p, $yield = $iter || nil;

      TMP_23.$$p = null;
      if (($yield !== nil)) {
        } else {
        return ($a = ($b = self).$enum_for, $a.$$p = (TMP_24 = function(){var self = TMP_24.$$s || this;

        return self.$size()}, TMP_24.$$s = self, TMP_24.$$arity = 0, TMP_24), $a).call($b, "each_pair")
      };
      ($a = ($c = self.$class().$members()).$each, $a.$$p = (TMP_25 = function(name){var self = TMP_25.$$s || this;
if (name == null) name = nil;
      return Opal.yield1($yield, [name, self['$[]'](name)]);}, TMP_25.$$s = self, TMP_25.$$arity = 1, TMP_25), $a).call($c);
      return self;
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$length', TMP_26 = function $$length() {
      var self = this;

      return self.$class().$members().$length();
    }, TMP_26.$$arity = 0);

    Opal.alias(self, 'size', 'length');

    Opal.defn(self, '$to_a', TMP_28 = function $$to_a() {
      var $a, $b, TMP_27, self = this;

      return ($a = ($b = self.$class().$members()).$map, $a.$$p = (TMP_27 = function(name){var self = TMP_27.$$s || this;
if (name == null) name = nil;
      return self['$[]'](name)}, TMP_27.$$s = self, TMP_27.$$arity = 1, TMP_27), $a).call($b);
    }, TMP_28.$$arity = 0);

    Opal.alias(self, 'values', 'to_a');

    Opal.defn(self, '$inspect', TMP_30 = function $$inspect() {
      var $a, $b, TMP_29, self = this, result = nil;

      result = "#<struct ";
      if ((($a = ($b = $scope.get('Struct')['$==='](self), $b !== false && $b !== nil && $b != null ?self.$class().$name() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        result = $rb_plus(result, "" + (self.$class()) + " ")};
      result = $rb_plus(result, ($a = ($b = self.$each_pair()).$map, $a.$$p = (TMP_29 = function(name, value){var self = TMP_29.$$s || this;
if (name == null) name = nil;if (value == null) value = nil;
      return "" + (name) + "=" + (value.$inspect())}, TMP_29.$$s = self, TMP_29.$$arity = 2, TMP_29), $a).call($b).$join(", "));
      result = $rb_plus(result, ">");
      return result;
    }, TMP_30.$$arity = 0);

    Opal.alias(self, 'to_s', 'inspect');

    Opal.defn(self, '$to_h', TMP_32 = function $$to_h() {
      var $a, $b, TMP_31, self = this;

      return ($a = ($b = self.$class().$members()).$inject, $a.$$p = (TMP_31 = function(h, name){var self = TMP_31.$$s || this;
if (h == null) h = nil;if (name == null) name = nil;
      h['$[]='](name, self['$[]'](name));
        return h;}, TMP_31.$$s = self, TMP_31.$$arity = 2, TMP_31), $a).call($b, $hash2([], {}));
    }, TMP_32.$$arity = 0);

    Opal.defn(self, '$values_at', TMP_34 = function $$values_at($a_rest) {
      var $b, $c, TMP_33, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      args = ($b = ($c = args).$map, $b.$$p = (TMP_33 = function(arg){var self = TMP_33.$$s || this;
if (arg == null) arg = nil;
      return arg.$$is_range ? arg.$to_a() : arg;}, TMP_33.$$s = self, TMP_33.$$arity = 1, TMP_33), $b).call($c).$flatten();
      
      var result = [];
      for (var i = 0, len = args.length; i < len; i++) {
        if (!args[i].$$is_number) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + ((args[i]).$class()) + " into Integer")
        }
        result.push(self['$[]'](args[i]));
      }
      return result;
    ;
    }, TMP_34.$$arity = -1);

    return (Opal.defs(self, '$_load', TMP_35 = function $$_load(args) {
      var $a, $b, self = this, attributes = nil;

      attributes = ($a = args).$values_at.apply($a, Opal.to_a(self.$members()));
      return ($b = self).$new.apply($b, Opal.to_a(attributes));
    }, TMP_35.$$arity = 1), nil) && '_load';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/io"] = function(Opal) {
  var $a, $b, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module, $gvars = Opal.gvars;

  Opal.add_stubs(['$attr_accessor', '$size', '$write', '$join', '$map', '$String', '$empty?', '$concat', '$chomp', '$getbyte', '$getc', '$raise', '$new', '$write_proc=', '$extend']);
  (function($base, $super) {
    function $IO(){};
    var self = $IO = $klass($base, $super, 'IO', $IO);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4;

    def.tty = def.closed = nil;
    Opal.cdecl($scope, 'SEEK_SET', 0);

    Opal.cdecl($scope, 'SEEK_CUR', 1);

    Opal.cdecl($scope, 'SEEK_END', 2);

    Opal.defn(self, '$tty?', TMP_1 = function() {
      var self = this;

      return self.tty;
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$closed?', TMP_2 = function() {
      var self = this;

      return self.closed;
    }, TMP_2.$$arity = 0);

    self.$attr_accessor("write_proc");

    Opal.defn(self, '$write', TMP_3 = function $$write(string) {
      var self = this;

      self.write_proc(string);
      return string.$size();
    }, TMP_3.$$arity = 1);

    self.$attr_accessor("sync", "tty");

    Opal.defn(self, '$flush', TMP_4 = function $$flush() {
      var self = this;

      return nil;
    }, TMP_4.$$arity = 0);

    (function($base) {
      var $Writable, self = $Writable = $module($base, 'Writable');

      var def = self.$$proto, $scope = self.$$scope, TMP_5, TMP_7, TMP_9;

      Opal.defn(self, '$<<', TMP_5 = function(string) {
        var self = this;

        self.$write(string);
        return self;
      }, TMP_5.$$arity = 1);

      Opal.defn(self, '$print', TMP_7 = function $$print($a_rest) {
        var $b, $c, TMP_6, self = this, args;
        if ($gvars[","] == null) $gvars[","] = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        self.$write(($b = ($c = args).$map, $b.$$p = (TMP_6 = function(arg){var self = TMP_6.$$s || this;
if (arg == null) arg = nil;
        return self.$String(arg)}, TMP_6.$$s = self, TMP_6.$$arity = 1, TMP_6), $b).call($c).$join($gvars[","]));
        return nil;
      }, TMP_7.$$arity = -1);

      Opal.defn(self, '$puts', TMP_9 = function $$puts($a_rest) {
        var $b, $c, TMP_8, self = this, args, newline = nil;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        newline = $gvars["/"];
        if ((($b = args['$empty?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$write($gvars["/"])
          } else {
          self.$write(($b = ($c = args).$map, $b.$$p = (TMP_8 = function(arg){var self = TMP_8.$$s || this;
if (arg == null) arg = nil;
          return self.$String(arg).$chomp()}, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8), $b).call($c).$concat([nil]).$join(newline))
        };
        return nil;
      }, TMP_9.$$arity = -1);
    })($scope.base);

    return (function($base) {
      var $Readable, self = $Readable = $module($base, 'Readable');

      var def = self.$$proto, $scope = self.$$scope, TMP_10, TMP_11, TMP_12, TMP_13;

      Opal.defn(self, '$readbyte', TMP_10 = function $$readbyte() {
        var self = this;

        return self.$getbyte();
      }, TMP_10.$$arity = 0);

      Opal.defn(self, '$readchar', TMP_11 = function $$readchar() {
        var self = this;

        return self.$getc();
      }, TMP_11.$$arity = 0);

      Opal.defn(self, '$readline', TMP_12 = function $$readline(sep) {
        var self = this;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        if (sep == null) {
          sep = $gvars["/"];
        }
        return self.$raise($scope.get('NotImplementedError'));
      }, TMP_12.$$arity = -1);

      Opal.defn(self, '$readpartial', TMP_13 = function $$readpartial(integer, outbuf) {
        var self = this;

        if (outbuf == null) {
          outbuf = nil;
        }
        return self.$raise($scope.get('NotImplementedError'));
      }, TMP_13.$$arity = -2);
    })($scope.base);
  })($scope.base, null);
  Opal.cdecl($scope, 'STDERR', $gvars.stderr = $scope.get('IO').$new());
  Opal.cdecl($scope, 'STDIN', $gvars.stdin = $scope.get('IO').$new());
  Opal.cdecl($scope, 'STDOUT', $gvars.stdout = $scope.get('IO').$new());
  (($a = [typeof(process) === 'object' ? function(s){process.stdout.write(s)} : function(s){console.log(s)}]), $b = $scope.get('STDOUT'), $b['$write_proc='].apply($b, $a), $a[$a.length-1]);
  (($a = [typeof(process) === 'object' ? function(s){process.stderr.write(s)} : function(s){console.warn(s)}]), $b = $scope.get('STDERR'), $b['$write_proc='].apply($b, $a), $a[$a.length-1]);
  $scope.get('STDOUT').$extend((($scope.get('IO')).$$scope.get('Writable')));
  return $scope.get('STDERR').$extend((($scope.get('IO')).$$scope.get('Writable')));
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/main"] = function(Opal) {
  var TMP_1, TMP_2, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$include']);
  Opal.defs(self, '$to_s', TMP_1 = function $$to_s() {
    var self = this;

    return "main";
  }, TMP_1.$$arity = 0);
  return (Opal.defs(self, '$include', TMP_2 = function $$include(mod) {
    var self = this;

    return $scope.get('Object').$include(mod);
  }, TMP_2.$$arity = 1), nil) && 'include';
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/dir"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$[]']);
  return (function($base, $super) {
    function $Dir(){};
    var self = $Dir = $klass($base, $super, 'Dir', $Dir);

    var def = self.$$proto, $scope = self.$$scope;

    return (function(self) {
      var $scope = self.$$scope, def = self.$$proto, TMP_1, TMP_2, TMP_3;

      Opal.defn(self, '$chdir', TMP_1 = function $$chdir(dir) {
        var self = this, $iter = TMP_1.$$p, $yield = $iter || nil, prev_cwd = nil;

        TMP_1.$$p = null;
        try {
        prev_cwd = Opal.current_dir;
        Opal.current_dir = dir;
        return Opal.yieldX($yield, []);;
        } finally {
          Opal.current_dir = prev_cwd;
        };
      }, TMP_1.$$arity = 1);
      Opal.defn(self, '$pwd', TMP_2 = function $$pwd() {
        var self = this;

        return Opal.current_dir || '.';
      }, TMP_2.$$arity = 0);
      Opal.alias(self, 'getwd', 'pwd');
      return (Opal.defn(self, '$home', TMP_3 = function $$home() {
        var $a, self = this;

        return ((($a = $scope.get('ENV')['$[]']("HOME")) !== false && $a !== nil && $a != null) ? $a : ".");
      }, TMP_3.$$arity = 0), nil) && 'home';
    })(Opal.get_singleton_class(self))
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/file"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range;

  Opal.add_stubs(['$join', '$compact', '$split', '$==', '$first', '$[]=', '$home', '$pwd', '$each', '$pop', '$<<', '$raise', '$respond_to?', '$to_path', '$class', '$nil?', '$is_a?', '$basename', '$empty?', '$rindex', '$[]', '$+', '$-', '$length', '$gsub', '$find', '$=~']);
  return (function($base, $super) {
    function $File(){};
    var self = $File = $klass($base, $super, 'File', $File);

    var def = self.$$proto, $scope = self.$$scope;

    Opal.cdecl($scope, 'Separator', Opal.cdecl($scope, 'SEPARATOR', "/"));

    Opal.cdecl($scope, 'ALT_SEPARATOR', nil);

    Opal.cdecl($scope, 'PATH_SEPARATOR', ":");

    Opal.cdecl($scope, 'FNM_SYSCASE', 0);

    return (function(self) {
      var $scope = self.$$scope, def = self.$$proto, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_8, TMP_9, TMP_10;

      Opal.defn(self, '$expand_path', TMP_2 = function $$expand_path(path, basedir) {
        var $a, $b, TMP_1, self = this, parts = nil, new_parts = nil;

        if (basedir == null) {
          basedir = nil;
        }
        path = [basedir, path].$compact().$join($scope.get('SEPARATOR'));
        parts = path.$split($scope.get('SEPARATOR'));
        new_parts = [];
        if (parts.$first()['$==']("~")) {
          parts['$[]='](0, $scope.get('Dir').$home())};
        if (parts.$first()['$=='](".")) {
          parts['$[]='](0, $scope.get('Dir').$pwd())};
        ($a = ($b = parts).$each, $a.$$p = (TMP_1 = function(part){var self = TMP_1.$$s || this;
if (part == null) part = nil;
        if (part['$==']("..")) {
            return new_parts.$pop()
            } else {
            return new_parts['$<<'](part)
          }}, TMP_1.$$s = self, TMP_1.$$arity = 1, TMP_1), $a).call($b);
        return new_parts.$join($scope.get('SEPARATOR'));
      }, TMP_2.$$arity = -2);
      Opal.alias(self, 'realpath', 'expand_path');
      
      function chompdirsep(path) {
        var last;

        while (path.length > 0) {
          if (isDirSep(path)) {
            last = path;
            path = path.substring(1, path.length);
            while (path.length > 0 && isDirSep(path)) {
              path = inc(path);
            }
            if (path.length == 0) {
              return last;
            }
          }
          else {
            path = inc(path);
          }
        }
        return path;
      }

      function inc(a) {
        return a.substring(1, a.length);
      }

      function skipprefix(path) {
        return path;
      }

      function lastSeparator(path) {
        var tmp, last;

        while (path.length > 0) {
          if (isDirSep(path)) {
            tmp = path;
            path = inc(path);

            while (path.length > 0 && isDirSep(path)) {
              path = inc(path);
            }
            if (!path) {
              break;
            }
            last = tmp;
          }
          else {
            path = inc(path);
          }
        }

        return last;
      }

      function isDirSep(sep) {
        return sep.charAt(0) === $scope.get('SEPARATOR');
      }

      function skipRoot(path) {
        while (path.length > 0 && isDirSep(path)) {
          path = inc(path);
        }
        return path;
      }

      function pointerSubtract(a, b) {
        if (a.length == 0) {
          return b.length;
        }
        return b.indexOf(a);
      }

      function handleSuffix(n, f, p, suffix, name, origName) {
        var suffixMatch;

        if (n >= 0) {
          if (suffix === nil) {
            f = n;
          }
          else {
            suffixMatch = suffix === '.*' ? '\\.\\w+' : suffix.replace(/\?/g, '\\?');
            suffixMatch = new RegExp(suffixMatch + $scope.get('Separator') + '*$').exec(p);
            if (suffixMatch) {
              f = suffixMatch.index;
            }
            else {
              f = n;
            }
          }

          if (f === origName.length) {
            return name;
          }
        }

        return p.substring(0, f);
      }
    
      Opal.defn(self, '$dirname', TMP_3 = function $$dirname(path) {
        var self = this;

        
        if (path === nil) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of nil into String")
        }
        if (path['$respond_to?']("to_path")) {
          path = path.$to_path();
        }
        if (!path.$$is_string) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + (path.$class()) + " into String")
        }

        var root, p;

        root = skipRoot(path);

        // if (root > name + 1) in the C code
        if (root.length == 0) {
          path = path.substring(path.length - 1, path.length);
        }
        else if (root.length - path.length < 0) {
          path = path.substring(path.indexOf(root)-1, path.length);
        }

        p = lastSeparator(root);
        if (!p) {
          p = root;
        }
        if (p === path) {
          return '.';
        }
        return path.substring(0, path.length - p.length);
      ;
      }, TMP_3.$$arity = 1);
      Opal.defn(self, '$basename', TMP_4 = function $$basename(name, suffix) {
        var self = this;

        if (suffix == null) {
          suffix = nil;
        }
        
        var p, q, e, f = 0, n = -1, tmp, pointerMath, origName;

        if (name === nil) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of nil into String")
        }
        if (name['$respond_to?']("to_path")) {
          name = name.$to_path();
        }
        if (!name.$$is_string) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + (name.$class()) + " into String")
        }
        if (suffix !== nil && !suffix.$$is_string) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + (suffix.$class()) + " into String")
        }

        if (name.length == 0) {
          return name;
        }

        origName = name;
        name = skipprefix(name);

        while (isDirSep(name)) {
          tmp = name;
          name = inc(name);
        }

        if (!name) {
          p = tmp;
          f = 1;
        }
        else {
          if (!(p = lastSeparator(name))) {
            p = name;
          }
          else {
            while (isDirSep(p)) {
              p = inc(p);
            }
          }

          n = pointerSubtract(chompdirsep(p), p);

          for (q = p; pointerSubtract(q, p) < n && q.charAt(0) === '.'; q = inc(q)) {
          }

          for (e = null; pointerSubtract(q, p) < n; q = inc(q)) {
            if (q.charAt(0) === '.') {
              e = q;
            }
          }

          if (e) {
            f = pointerSubtract(e, p);
          }
          else {
            f = n;
          }
        }

        return handleSuffix(n, f, p, suffix, name, origName);
      ;
      }, TMP_4.$$arity = -2);
      Opal.defn(self, '$extname', TMP_5 = function $$extname(path) {
        var $a, $b, self = this, filename = nil, last_dot_idx = nil;

        if ((($a = path['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise($scope.get('TypeError'), "no implicit conversion of nil into String")};
        if ((($a = path['$respond_to?']("to_path")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          path = path.$to_path()};
        if ((($a = path['$is_a?']($scope.get('String'))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise($scope.get('TypeError'), "no implicit conversion of " + (path.$class()) + " into String")
        };
        filename = self.$basename(path);
        if ((($a = filename['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return ""};
        last_dot_idx = filename['$[]']($range(1, -1, false)).$rindex(".");
        if ((($a = (((($b = last_dot_idx['$nil?']()) !== false && $b !== nil && $b != null) ? $b : $rb_plus(last_dot_idx, 1)['$==']($rb_minus(filename.$length(), 1))))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return ""
          } else {
          return filename['$[]']($range(($rb_plus(last_dot_idx, 1)), -1, false))
        };
      }, TMP_5.$$arity = 1);
      Opal.defn(self, '$exist?', TMP_6 = function(path) {
        var self = this;

        return Opal.modules[path] != null;
      }, TMP_6.$$arity = 1);
      Opal.alias(self, 'exists?', 'exist?');
      Opal.defn(self, '$directory?', TMP_8 = function(path) {
        var $a, $b, TMP_7, self = this, files = nil, file = nil;

        files = [];
        
        for (var key in Opal.modules) {
          files.push(key)
        }
      ;
        path = path.$gsub((new RegExp("(^." + $scope.get('SEPARATOR') + "+|" + $scope.get('SEPARATOR') + "+$)")));
        file = ($a = ($b = files).$find, $a.$$p = (TMP_7 = function(file){var self = TMP_7.$$s || this;
if (file == null) file = nil;
        return file['$=~']((new RegExp("^" + path)))}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7), $a).call($b);
        return file;
      }, TMP_8.$$arity = 1);
      Opal.defn(self, '$join', TMP_9 = function $$join($a_rest) {
        var self = this, paths;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        paths = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          paths[$arg_idx - 0] = arguments[$arg_idx];
        }
        return paths.$join($scope.get('SEPARATOR')).$gsub((new RegExp("" + $scope.get('SEPARATOR') + "+")), $scope.get('SEPARATOR'));
      }, TMP_9.$$arity = -1);
      return (Opal.defn(self, '$split', TMP_10 = function $$split(path) {
        var self = this;

        return path.$split($scope.get('SEPARATOR'));
      }, TMP_10.$$arity = 1), nil) && 'split';
    })(Opal.get_singleton_class(self));
  })($scope.base, $scope.get('IO'))
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/process"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$to_f', '$now', '$new']);
  (function($base, $super) {
    function $Process(){};
    var self = $Process = $klass($base, $super, 'Process', $Process);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3;

    Opal.cdecl($scope, 'CLOCK_REALTIME', 0);

    Opal.cdecl($scope, 'CLOCK_MONOTONIC', 1);

    Opal.defs(self, '$pid', TMP_1 = function $$pid() {
      var self = this;

      return 0;
    }, TMP_1.$$arity = 0);

    Opal.defs(self, '$times', TMP_2 = function $$times() {
      var self = this, t = nil;

      t = $scope.get('Time').$now().$to_f();
      return (($scope.get('Benchmark')).$$scope.get('Tms')).$new(t, t, t, t, t);
    }, TMP_2.$$arity = 0);

    return (Opal.defs(self, '$clock_gettime', TMP_3 = function $$clock_gettime(clock_id, unit) {
      var self = this;

      if (unit == null) {
        unit = nil;
      }
      return $scope.get('Time').$now().$to_f();
    }, TMP_3.$$arity = -2), nil) && 'clock_gettime';
  })($scope.base, null);
  (function($base, $super) {
    function $Signal(){};
    var self = $Signal = $klass($base, $super, 'Signal', $Signal);

    var def = self.$$proto, $scope = self.$$scope, TMP_4;

    return (Opal.defs(self, '$trap', TMP_4 = function $$trap($a_rest) {
      var self = this;

      return nil;
    }, TMP_4.$$arity = -1), nil) && 'trap'
  })($scope.base, null);
  return (function($base, $super) {
    function $GC(){};
    var self = $GC = $klass($base, $super, 'GC', $GC);

    var def = self.$$proto, $scope = self.$$scope, TMP_5;

    return (Opal.defs(self, '$start', TMP_5 = function $$start() {
      var self = this;

      return nil;
    }, TMP_5.$$arity = 0), nil) && 'start'
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["corelib/unsupported"] = function(Opal) {
  var TMP_30, TMP_31, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$raise', '$warn', '$%']);
  
  var warnings = {};

  function handle_unsupported_feature(message) {
    switch (Opal.config.unsupported_features_severity) {
    case 'error':
      $scope.get('Kernel').$raise($scope.get('NotImplementedError'), message)
      break;
    case 'warning':
      warn(message)
      break;
    default: // ignore
      // noop
    }
  }

  function warn(string) {
    if (warnings[string]) {
      return;
    }

    warnings[string] = true;
    self.$warn(string);
  }

  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18;

    var ERROR = "String#%s not supported. Mutable String methods are not supported in Opal.";

    Opal.defn(self, '$<<', TMP_1 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("<<"));
    }, TMP_1.$$arity = -1);

    Opal.defn(self, '$capitalize!', TMP_2 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("capitalize!"));
    }, TMP_2.$$arity = -1);

    Opal.defn(self, '$chomp!', TMP_3 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("chomp!"));
    }, TMP_3.$$arity = -1);

    Opal.defn(self, '$chop!', TMP_4 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("chop!"));
    }, TMP_4.$$arity = -1);

    Opal.defn(self, '$downcase!', TMP_5 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("downcase!"));
    }, TMP_5.$$arity = -1);

    Opal.defn(self, '$gsub!', TMP_6 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("gsub!"));
    }, TMP_6.$$arity = -1);

    Opal.defn(self, '$lstrip!', TMP_7 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("lstrip!"));
    }, TMP_7.$$arity = -1);

    Opal.defn(self, '$next!', TMP_8 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("next!"));
    }, TMP_8.$$arity = -1);

    Opal.defn(self, '$reverse!', TMP_9 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("reverse!"));
    }, TMP_9.$$arity = -1);

    Opal.defn(self, '$slice!', TMP_10 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("slice!"));
    }, TMP_10.$$arity = -1);

    Opal.defn(self, '$squeeze!', TMP_11 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("squeeze!"));
    }, TMP_11.$$arity = -1);

    Opal.defn(self, '$strip!', TMP_12 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("strip!"));
    }, TMP_12.$$arity = -1);

    Opal.defn(self, '$sub!', TMP_13 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("sub!"));
    }, TMP_13.$$arity = -1);

    Opal.defn(self, '$succ!', TMP_14 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("succ!"));
    }, TMP_14.$$arity = -1);

    Opal.defn(self, '$swapcase!', TMP_15 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("swapcase!"));
    }, TMP_15.$$arity = -1);

    Opal.defn(self, '$tr!', TMP_16 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("tr!"));
    }, TMP_16.$$arity = -1);

    Opal.defn(self, '$tr_s!', TMP_17 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("tr_s!"));
    }, TMP_17.$$arity = -1);

    return (Opal.defn(self, '$upcase!', TMP_18 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), (ERROR)['$%']("upcase!"));
    }, TMP_18.$$arity = -1), nil) && 'upcase!';
  })($scope.base, null);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_19, TMP_20;

    var ERROR = "Object freezing is not supported by Opal";

    Opal.defn(self, '$freeze', TMP_19 = function $$freeze() {
      var self = this;

      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$frozen?', TMP_20 = function() {
      var self = this;

      handle_unsupported_feature(ERROR);
      return false;
    }, TMP_20.$$arity = 0);
  })($scope.base);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_21, TMP_22, TMP_23;

    var ERROR = "Object tainting is not supported by Opal";

    Opal.defn(self, '$taint', TMP_21 = function $$taint() {
      var self = this;

      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$untaint', TMP_22 = function $$untaint() {
      var self = this;

      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$tainted?', TMP_23 = function() {
      var self = this;

      handle_unsupported_feature(ERROR);
      return false;
    }, TMP_23.$$arity = 0);
  })($scope.base);
  (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope, TMP_24, TMP_25, TMP_26, TMP_27;

    Opal.defn(self, '$public', TMP_24 = function($a_rest) {
      var self = this, methods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      methods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        methods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (methods.length === 0) {
        self.$$module_function = false;
      }

      return nil;
    
    }, TMP_24.$$arity = -1);

    Opal.alias(self, 'private', 'public');

    Opal.alias(self, 'protected', 'public');

    Opal.alias(self, 'nesting', 'public');

    Opal.defn(self, '$private_class_method', TMP_25 = function $$private_class_method($a_rest) {
      var self = this;

      return self;
    }, TMP_25.$$arity = -1);

    Opal.alias(self, 'public_class_method', 'private_class_method');

    Opal.defn(self, '$private_method_defined?', TMP_26 = function(obj) {
      var self = this;

      return false;
    }, TMP_26.$$arity = 1);

    Opal.defn(self, '$private_constant', TMP_27 = function $$private_constant($a_rest) {
      var self = this;

      return nil;
    }, TMP_27.$$arity = -1);

    Opal.alias(self, 'protected_method_defined?', 'private_method_defined?');

    Opal.alias(self, 'public_instance_methods', 'instance_methods');

    return Opal.alias(self, 'public_method_defined?', 'method_defined?');
  })($scope.base, null);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_28;

    Opal.defn(self, '$private_methods', TMP_28 = function $$private_methods($a_rest) {
      var self = this;

      return [];
    }, TMP_28.$$arity = -1);

    Opal.alias(self, 'private_instance_methods', 'private_methods');
  })($scope.base);
  (function($base) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, TMP_29;

    Opal.defn(self, '$eval', TMP_29 = function($a_rest) {
      var self = this;

      return self.$raise($scope.get('NotImplementedError'), "To use Kernel#eval, you must first require 'opal-parser'. " + ("See https://github.com/opal/opal/blob/" + ($scope.get('RUBY_ENGINE_VERSION')) + "/docs/opal_parser.md for details."));
    }, TMP_29.$$arity = -1)
  })($scope.base);
  Opal.defs(self, '$public', TMP_30 = function($a_rest) {
    var self = this;

    return nil;
  }, TMP_30.$$arity = -1);
  return (Opal.defs(self, '$private', TMP_31 = function($a_rest) {
    var self = this;

    return nil;
  }, TMP_31.$$arity = -1), nil) && 'private';
};

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  self.$require("opal/base");
  self.$require("opal/mini");
  self.$require("corelib/string/inheritance");
  self.$require("corelib/string/encoding");
  self.$require("corelib/math");
  self.$require("corelib/complex");
  self.$require("corelib/rational");
  self.$require("corelib/time");
  self.$require("corelib/struct");
  self.$require("corelib/io");
  self.$require("corelib/main");
  self.$require("corelib/dir");
  self.$require("corelib/file");
  self.$require("corelib/process");
  return self.$require("corelib/unsupported");
})(Opal);

/* Generated by Opal 0.10.5 */
Opal.modules["log"] = function(Opal) {
  var TMP_1, TMP_2, TMP_4, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars;

  Opal.add_stubs(['$print', '$tosjis', '$puts', '$kind_of?', '$inspect', '$empty?', '$debugPuts', '$map', '$join']);
  Opal.defn(Opal.Object, '$debugPrint', TMP_1 = function $$debugPrint(text) {
    var $a, self = this;
    if ($gvars.RUBY18_WIN == null) $gvars.RUBY18_WIN = nil;

    return self.$print((function() {if ((($a = $gvars.RUBY18_WIN) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      return text.$tosjis()
      } else {
      return text
    }; return nil; })());
  }, TMP_1.$$arity = 1);
  Opal.defn(Opal.Object, '$debugPuts', TMP_2 = function $$debugPuts(text) {
    var $a, self = this, line = nil;
    if ($gvars.RUBY18_WIN == null) $gvars.RUBY18_WIN = nil;

    line = "" + (text) + "\n";
    return self.$puts((function() {if ((($a = $gvars.RUBY18_WIN) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      return line.$tosjis()
      } else {
      return line
    }; return nil; })());
  }, TMP_2.$$arity = 1);
  return (Opal.defn(Opal.Object, '$debug', TMP_4 = function $$debug(target, $a_rest) {
    var $b, $c, TMP_3, self = this, values, targetStr = nil, valueStrs = nil;
    if ($gvars.isDebug == null) $gvars.isDebug = nil;

    var $args_len = arguments.length, $rest_len = $args_len - 1;
    if ($rest_len < 0) { $rest_len = 0; }
    values = new Array($rest_len);
    for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
      values[$arg_idx - 1] = arguments[$arg_idx];
    }
    if ((($b = $gvars.isDebug) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      } else {
      return nil
    };
    targetStr = (function() {if ((($b = target['$kind_of?']($scope.get('String'))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      return target
      } else {
      return target.$inspect()
    }; return nil; })();
    if ((($b = values['$empty?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      return self.$debugPuts(targetStr)
      } else {
      valueStrs = ($b = ($c = values).$map, $b.$$p = (TMP_3 = function(value){var self = TMP_3.$$s || this, $a;
if (value == null) value = nil;
      if ((($a = value['$kind_of?']($scope.get('String'))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return "\"" + (value) + "\""
          } else {
          return value.$inspect()
        }}, TMP_3.$$s = self, TMP_3.$$arity = 1, TMP_3), $b).call($c);
      return self.$debugPuts("" + (targetStr) + ": " + (valueStrs.$join(", ")));
    };
  }, TMP_4.$$arity = -2), nil) && 'debug';
};

/* Generated by Opal 0.10.5 */
Opal.modules["configBcDiceForSystem"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars;

  $gvars.okResult = "_OK_";
  $gvars.ngResult = "_NG_";
  return $gvars.ircNickMaxLength = 9;
};

/* Generated by Opal 0.10.5 */
Opal.modules["configBcDice"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars;
  if ($gvars.bcDiceVersion == null) $gvars.bcDiceVersion = nil;

  Opal.add_stubs(['$require', '$+']);
  self.$require("configBcDiceForSystem.rb");
  $gvars.isDebug = true;
  $gvars.bcDiceVersion = "2.02.29";
  $gvars.SEND_STR_MAX = 405;
  $gvars.isRollVoidDiceAtAnyRecive = true;
  $gvars.DICE_MAXCNT = 200;
  $gvars.DICE_MAXNUM = 1000;
  $gvars.ircCode = 6;
  $gvars.isHandSort = true;
  $gvars.quitCommand = "お疲れ様";
  $gvars.quitMessage = "さようなら";
  $gvars.OPEN_DICE = "Open Dice!";
  $gvars.OPEN_PLOT = "Open Plot!";
  $gvars.ADD_PLOT = "PLOT";
  $gvars.READY_CMD = "#HERE";
  $gvars.server = "irc.trpg.net";
  $gvars.port = 6667;
  $gvars.defaultLoginChannelsText = "#Dice_Test";
  $gvars.nick = "bcDICE";
  $gvars.userName = $rb_plus("v", $gvars.bcDiceVersion);
  $gvars.ircName = "rubydice";
  $gvars.defaultGameType = "";
  $gvars.extraCardFileName = "";
  $gvars.iniFileName = "bcdice.ini";
  return $gvars.allGameTypes = ["AceKillerGene", "Airgetlamh", "Alsetto", "Alshard", "Amadeus", "Amadeus:Korean", "Arianrhod", "ArsMagica", "Avandner", "BadLife", "BarnaKronika", "BattleTech", "BeastBindTrinity", "BeginningIdol", "BeginningIdol:Korean", "BladeOfArcana", "BloodCrusade", "BloodMoon", "CardRanker", "Chaos_Flare", "Chill", "Chill3", "CodeLayerd", "ColossalHunter", "CrashWorld", "Cthulhu", "Cthulhu7th", "Cthulhu7th:ChineseTraditional", "Cthulhu7th:Korean", "Cthulhu:ChineseTraditional", "Cthulhu:Korean", "CthulhuTech", "DarkBlaze", "DeadlineHeroes", "DemonParasite", "DetatokoSaga", "DetatokoSaga:Korean", "DiceOfTheDead", "DoubleCross", "Dracurouge", "Dracurouge:Korean", "DungeonsAndDoragons", "EarthDawn", "EarthDawn3", "EarthDawn4", "EclipsePhase", "Elric!", "Elysion", "EmbryoMachine", "EndBreaker", "EtrianOdysseySRS", "FilledWith", "FullMetalPanic", "GURPS", "Garako", "GardenOrder", "GehennaAn", "GeishaGirlwithKatana", "GoldenSkyStories", "Gorilla", "GranCrest", "Gundog", "GundogRevised", "GundogZero", "GurpsFW", "HarnMaster", "Hieizan", "HouraiGakuen", "HuntersMoon", "InfiniteFantasia", "Insane", "Insane:Korean", "IthaWenUa", "JamesBond", "Kamigakari", "Kamigakari:Korean", "KanColle", "KillDeathBusiness", "KillDeathBusiness:Korean", "LiveraDoll", "LogHorizon", "LogHorizon:Korean", "LostRoyal", "MagicaLogia", "MeikyuDays", "MeikyuKingdom", "MetalHead", "MetalHeadExtream", "MetallicGuadian", "MonotoneMusium", "MonotoneMusium:Korean", "NJSLYRBATTLE", "Nechronica", "Nechronica:Korean", "NightWizard", "NightWizard3rd", "NightmareHunterDeep", "Nuekagami", "OneWayHeroics", "Oukahoushin3rd", "Paranoia", "ParasiteBlood", "Pathfinder", "Peekaboo", "Pendragon", "PhantasmAdventure", "RecordOfSteam", "RokumonSekai2", "RoleMaster", "RuneQuest", "Ryutama", "SMTKakuseihen", "SRS", "Satasupe", "SevenFortressMobius", "ShadowRun", "ShadowRun4", "SharedFantasia", "ShinkuuGakuen", "ShinobiGami", "ShoujoTenrankai", "Skynauts", "StrangerOfSwordCity", "Strave", "SwordWorld", "SwordWorld2.0", "TORG", "TORG1.5", "TherapieSein", "TokumeiTenkousei", "TokyoNova", "Tunnels_&_Trolls", "TwilightGunsmoke", "Utakaze", "WARPS", "WaresBlade", "Warhammer", "WitchQuest", "ZettaiReido"];
};

/* Generated by Opal 0.10.5 */
Opal.modules["CountHolder"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$debug', '$getNick', '$==', '$===', '$get_point_list', '$delete_point_list', '$nil?', '$rename_point_counter', '$!=', '$=~', '$executeSetCommand', '$to_i', '$setCountHolderByParams', '$setCount', '$changeCount', '$[]', '$[]=', '$getCharacterInfoList', '$+', '$downcase', '$parren_killer', '$getCharacterInfo', '$getValueText', '$getPointListAtSameNick', '$empty?', '$getPointListAtSameChannel', '$each', '$sort_point_hash', '$split', '$upcase', '$sort', '$keys', '$delete', '$setPointCounter', '$include?', '$<<', '$sort_by', '$getPointHashCurrentAndMax', '$<=>', '$b_crr', '$a_crr']);
  self.$require("log");
  self.$require("configBcDice.rb");
  return (function($base, $super) {
    function $CountHolder(){};
    var self = $CountHolder = $klass($base, $super, 'CountHolder', $CountHolder);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_15, TMP_18, TMP_19, TMP_20, TMP_21, TMP_23, TMP_24;

    def.bcdice = def.command = def.nick = def.channel = def.pointerMode = def.maxValue = def.characterName = def.tagName = def.currentValue = def.modifyText = def.countInfos = nil;
    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(bcdice, countInfos) {
      var self = this;

      self.bcdice = bcdice;
      return self.countInfos = countInfos;
    }, TMP_1.$$arity = 2);

    Opal.defn(self, '$executeCommand', TMP_2 = function $$executeCommand(command, nick, channel, pointerMode) {
      var $a, self = this, output = nil, isSecret = nil, $case = nil;

      self.$debug("point_counter_command begin(command, nick, channel, pointerMode)", command, nick, channel, pointerMode);
      self.command = command;
      self.nick = self.bcdice.$getNick(nick);
      self.channel = channel;
      self.pointerMode = pointerMode;
      output = "1";
      isSecret = (pointerMode['$==']("sameNick"));
      $case = self.command;if (/^#OPEN!/i['$===']($case)) {output = self.$get_point_list()}else if (/^#(.*)DIED!/i['$===']($case)) {output = self.$delete_point_list();
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        output = "" + (nick) + ": " + (output) + " のカウンタが削除されました";
        isSecret = true;
      };}else if (/^#RENAME!/i['$===']($case)) {output = self.$rename_point_counter();
      if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (nick) + ": " + (output);
        isSecret = false;};}else {if ((($a = (/^#/['$=~'](self.command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = self.$executeSetCommand();
        if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = "" + (nick) + ": " + (output)};}};
      self.$debug("point_counter_command END output, isSecret", output, isSecret);
      return [output, isSecret];
    }, TMP_2.$$arity = 4);

    Opal.defn(self, '$executeSetCommand', TMP_3 = function $$executeSetCommand() {
      var $a, self = this, output = nil, $case = nil;
      if ($gvars.point_counter == null) $gvars.point_counter = nil;

      self.$debug("setCountHolder nick, channel, pointerMode", self.nick, self.channel, self.pointerMode);
      self.characterName = self.nick;
      self.tagName = nil;
      self.currentValue = nil;
      self.maxValue = nil;
      self.modifyText = nil;
      self.$debug("$point_counter", $gvars.point_counter);
      output = "1";
      self.$debug("@command", self.command);
      $case = self.command;if (/^#([^:\uFF1A]+)(:|\uFF1A)(\w+?)\s*(\d+)(\/(\d+))?/['$===']($case)) {self.$debug(" #(識別名):(タグ)(現在値)/(最大値) で指定します。最大値がないものは省略できます。");
      self.characterName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      self.currentValue = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4)).$to_i();
      self.maxValue = (($a = $gvars['~']) === nil ? nil : $a['$[]'](6));}else if (/^#([^:：]+)(:|：)(\w+?)\s*([\+\-]\d+)/['$===']($case)) {self.$debug(" #(識別名):(タグ)(変更量)");
      self.characterName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      self.modifyText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));}else if (/^#(\w+?)\s*(\d+)\/(\d+)/['$===']($case)) {self.$debug(" #(タグ)(現在値)/(最大値) 現在値/最大値指定は半角のみ。");
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.currentValue = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
      self.maxValue = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));}else if (/^#(\w+?)\s*([\+\-]\d+)/['$===']($case)) {self.$debug(" #(タグ)(変更量)");
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.modifyText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));}else if (/^#(\w+?)\s*(\d+)/['$===']($case)) {self.$debug(" #(タグ)(現在値) で指定します。現在値は半角です。");
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.currentValue = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();}else if (/^#(\w+?)\s*([\+\-]\d+)/['$===']($case)) {self.$debug(" #(タグ)(変更量) ");
      self.tagName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.modifyText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));}else {self.$debug("not match command", self.command);
      return "";};
      if ((($a = (self.maxValue['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.maxValue = self.maxValue.$to_i()
      };
      self.$debug("characterName", self.characterName);
      self.$debug("tagName", self.tagName);
      self.$debug("@currentValue", self.currentValue);
      self.$debug("@maxValue", self.maxValue);
      self.$debug("@modifyText", self.modifyText);
      return self.$setCountHolderByParams();
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$setCountHolderByParams', TMP_4 = function $$setCountHolderByParams() {
      var $a, self = this;

      self.$debug("@modifyText", self.modifyText);
      if ((($a = (self.modifyText['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$setCount()
        } else {
        return self.$changeCount()
      };
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$setCount', TMP_5 = function $$setCount() {
      var $a, $b, $c, self = this, characterInfoList = nil, characterInfo = nil, output = nil;

      ($a = self.channel, $b = self.countInfos, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, $hash2([], {}))));
      characterInfoList = self.$getCharacterInfoList();
      ($a = self.characterName, $b = characterInfoList, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, $hash2([], {}))));
      characterInfo = characterInfoList['$[]'](self.characterName);
      characterInfo['$[]='](self.tagName, $hash2(["currentValue", "maxValue"], {"currentValue": self.currentValue, "maxValue": self.maxValue}));
      self.$debug("setCount @nick, @characterName", self.nick, self.characterName);
      output = "";
      if ((($a = (self.nick['$!='](self.characterName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "" + (self.characterName.$downcase()))};
      output = $rb_plus(output, "(" + (self.tagName) + ") " + (self.currentValue));
      self.$debug("setCount @maxValue", self.maxValue);
      if ((($a = (self.maxValue['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        output = $rb_plus(output, "/" + (self.maxValue))
      };
      return output;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$changeCount', TMP_6 = function $$changeCount() {
      var $a, self = this, modifyValue = nil, characterInfo = nil, info = nil, currentValue = nil, maxValue = nil, preText = nil, nowText = nil, output = nil;

      self.$debug("changeCount begin");
      modifyValue = self.bcdice.$parren_killer("(0" + (self.modifyText) + ")").$to_i();
      characterInfo = self.$getCharacterInfo(self.channel, self.characterName);
      info = characterInfo['$[]'](self.tagName);
      self.$debug("characterInfo", characterInfo);
      self.$debug("info", info);
      if ((($a = (info['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      currentValue = info['$[]']("currentValue");
      maxValue = info['$[]']("maxValue");
      preText = self.$getValueText(currentValue, maxValue);
      self.$debug("currentValue", currentValue);
      self.$debug("modifyValue", modifyValue);
      currentValue = $rb_plus(currentValue, modifyValue);
      info['$[]=']("currentValue", currentValue);
      nowText = self.$getValueText(currentValue, maxValue);
      output = "";
      if ((($a = (self.nick['$!='](self.characterName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "" + (self.characterName.$downcase()))};
      output = $rb_plus(output, "(" + (self.tagName) + ") " + (preText) + " -> " + (nowText));
      self.$debug("changeCount end output", output);
      return output;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$getValueText', TMP_7 = function $$getValueText(currentValue, maxValue) {
      var $a, self = this, text = nil;

      text = "" + (currentValue);
      if ((($a = (maxValue['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        text = $rb_plus(text, "/" + (maxValue))
      };
      return text;
    }, TMP_7.$$arity = 2);

    Opal.defn(self, '$getCharacterInfoList', TMP_8 = function $$getCharacterInfoList(channel) {
      var $a, $b, $c, self = this, characterInfoList = nil;

      if (channel == null) {
        channel = nil;
      }
      ((($a = channel) !== false && $a !== nil && $a != null) ? $a : channel = self.channel);
      ($a = channel, $b = self.countInfos, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, $hash2([], {}))));
      characterInfoList = self.countInfos['$[]'](channel);
      return characterInfoList;
    }, TMP_8.$$arity = -1);

    Opal.defn(self, '$getCharacterInfo', TMP_9 = function $$getCharacterInfo(channel, characterName) {
      var $a, $b, $c, self = this, characterInfoList = nil, characterInfo = nil;

      ((($a = characterName) !== false && $a !== nil && $a != null) ? $a : characterName = self.characterName);
      characterInfoList = self.$getCharacterInfoList(channel);
      ($a = characterName, $b = characterInfoList, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, $hash2([], {}))));
      characterInfo = characterInfoList['$[]'](characterName);
      return characterInfo;
    }, TMP_9.$$arity = 2);

    Opal.defn(self, '$get_point_list', TMP_10 = function $$get_point_list() {
      var $a, self = this, output = nil, tag = nil, $case = nil, pc_out = nil;

      self.$debug("get_point_list(command, nick, channel, pointerMode)", self.command, self.nick, self.channel, self.pointerMode);
      output = "1";
      if ((($a = (/^#OPEN![\s]*(\w*)(\s|$)/['$=~'](self.command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      tag = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      $case = self.pointerMode;if ("sameNick"['$===']($case)) {self.$debug("same nick");
      pc_out = self.$getPointListAtSameNick(tag);
      if ((($a = (pc_out['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        output = pc_out
      };}else if ("sameChannel"['$===']($case)) {if ((($a = (tag)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("same Channel");
        pc_out = self.$getPointListAtSameChannel(tag);
        if ((($a = (pc_out['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          output = pc_out
        };}};
      return output;
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$getPointListAtSameNick', TMP_15 = function $$getPointListAtSameNick(command, nick, channel, pointerMode, tag) {
      var $a, $b, TMP_11, $c, TMP_13, $d, TMP_14, self = this, pc_list = nil, pc_out = nil, sort_pc = nil, out_pc = nil, pc_sorted = nil, tag_arr = nil, tag_out = nil;
      if ($gvars.point_counter == null) $gvars.point_counter = nil;

      self.$debug("getPointListAtSameNick(command, nick, channel, pointerMode, tag)", command, nick, channel, pointerMode, tag);
      self.$debug("同一Nick, 自キャラの一覧表示(パラメータ指定不要)");
      pc_list = $gvars.point_counter['$[]'](nick);
      pc_out = "";
      if ((($a = (pc_list)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        sort_pc = $hash2([], {});
        ($a = ($b = pc_list).$each, $a.$$p = (TMP_11 = function(pc_o){var self = TMP_11.$$s || this, $c, $d, TMP_12, tag_out = nil, check_name = nil, tag_arr = nil;
          if ($gvars.point_counter == null) $gvars.point_counter = nil;
if (pc_o == null) pc_o = nil;
        if ((($c = ($gvars.point_counter['$[]']("" + (nick) + "," + (pc_o)))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            tag_out = "";
            if ((($c = (tag)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
              check_name = "" + (nick) + "," + (pc_o);
              if ((($c = ($gvars.point_counter['$[]']("" + (check_name) + "," + (tag) + ",0"))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
                sort_pc['$[]='](check_name, $gvars.point_counter['$[]']("" + (check_name) + "," + (tag) + ",0"))};
              if ((($c = ($gvars.point_counter['$[]']("" + (check_name) + "," + (tag) + ",1"))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
                sort_pc['$[]='](check_name, $gvars.point_counter['$[]']("" + (check_name) + "," + (tag) + ",1"))};
              } else {
              tag_arr = $gvars.point_counter['$[]']("" + (nick) + "," + (pc_o));
              ($c = ($d = tag_arr).$each, $c.$$p = (TMP_12 = function(tag_o){var self = TMP_12.$$s || this, $e;
                if ($gvars.point_counter == null) $gvars.point_counter = nil;
if (tag_o == null) tag_o = nil;
              check_name = "" + (nick) + "," + (pc_o) + "," + (tag_o);
                if ((($e = ($gvars.point_counter['$[]']("" + (check_name) + ",0"))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
                  tag_out = $rb_plus(tag_out, $rb_plus($rb_plus("$tag_o(", $gvars.point_counter['$[]']("" + (check_name) + ",0")), ") "))};
                if ((($e = ($gvars.point_counter['$[]']("" + (check_name) + ",1"))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
                  return tag_out = $rb_plus(tag_out, $rb_plus($rb_plus("" + (tag_o) + "[", $gvars.point_counter['$[]']("" + (check_name) + ",1")), "] "))
                  } else {
                  return nil
                };}, TMP_12.$$s = self, TMP_12.$$arity = 1, TMP_12), $c).call($d);
            };
            if ((($c = (tag_out)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
              self.$debug("中身があるなら");
              if ((($c = (pc_out)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
                pc_out = $rb_plus(pc_out, ", ")};
              return pc_out = $rb_plus(pc_out, "" + (pc_o.$downcase()) + ":" + (tag_out));
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_11.$$s = self, TMP_11.$$arity = 1, TMP_11), $a).call($b);
        if ((($a = (tag)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          out_pc = "";
          pc_sorted = self.$sort_point_hash(sort_pc);
          ($a = ($c = pc_sorted).$each, $a.$$p = (TMP_13 = function(pc_o){var self = TMP_13.$$s || this, $d, pc_name = nil;
            if ($gvars.pc_name == null) $gvars.pc_name = nil;
            if ($gvars.point_counter == null) $gvars.point_counter = nil;
if (pc_o == null) pc_o = nil;
          pc_name = pc_o.$split(/,/);
            if ((($d = (out_pc)) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
              out_pc = $rb_plus(out_pc, ", ")};
            if ((($d = ($gvars.pc_name['$[]'](1))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
              if ((($d = ($gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",0"))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
                out_pc = $rb_plus(out_pc, $rb_plus($rb_plus("" + (pc_name['$[]'](1).$upcase()) + "(", $gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",0")), ")"))};
              if ((($d = ($gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",1"))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
                return out_pc = $rb_plus(out_pc, $rb_plus($rb_plus("" + (pc_name['$[]'](1).$upcase()) + "[", $gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",1")), "]"))
                } else {
                return nil
              };
              } else {
              if ((($d = ($gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",0"))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
                out_pc = $rb_plus(out_pc, $rb_plus($rb_plus("" + (pc_name['$[]'](0).$upcase()) + "(", $gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",0")), ")"))};
              if ((($d = ($gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",1"))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
                return out_pc = $rb_plus(out_pc, $rb_plus($rb_plus("" + (pc_name['$[]'](0).$upcase()) + "[", $gvars.point_counter['$[]']("" + (pc_o) + "," + (tag) + ",1")), "]"))
                } else {
                return nil
              };
            };}, TMP_13.$$s = self, TMP_13.$$arity = 1, TMP_13), $a).call($c);
          if ((($a = (out_pc)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            pc_out = "" + (tag) + ": " + (out_pc)};};
      } else if ((($a = ($gvars.point_counter['$[]']("$nick,"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        tag_arr = $gvars.point_counter['$[]']("$nick,");
        tag_out = "";
        ($a = ($d = tag_arr).$each, $a.$$p = (TMP_14 = function(tag_o){var self = TMP_14.$$s || this, $e, check_name = nil;
          if ($gvars.point_counter == null) $gvars.point_counter = nil;
if (tag_o == null) tag_o = nil;
        check_name = "" + (nick) + ",," + (tag_o);
          if ((($e = ($gvars.point_counter['$[]']("" + (check_name) + ",0"))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            tag_out = $rb_plus(tag_out, $rb_plus($rb_plus("" + (tag_o) + "(", $gvars.point_counter['$[]']("" + (check_name) + ",0")), ") "))};
          if ((($e = ($gvars.point_counter['$[]']("" + (check_name) + ",1"))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            return tag_out = $rb_plus(tag_out, $rb_plus($rb_plus("" + (tag_o) + "[", $gvars.point_counter['$[]']("" + (check_name) + ",1")), "] "))
            } else {
            return nil
          };}, TMP_14.$$s = self, TMP_14.$$arity = 1, TMP_14), $a).call($d);
        if ((($a = (tag_out)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$debug("中身があるなら");
          if ((($a = (pc_out)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            pc_out = $rb_plus(pc_out, ", ")};
          pc_out = $rb_plus(pc_out, "" + (tag_out));};};
      return pc_out;
    }, TMP_15.$$arity = 5);

    Opal.defn(self, '$getPointListAtSameChannel', TMP_18 = function $$getPointListAtSameChannel(tagName) {
      var $a, $b, TMP_16, self = this, output = nil, characterInfoList = nil;

      self.$debug("getPointListAtSameChannel(command, nick, channel, pointerMode, tagName)", self.command, self.nick, self.channel, self.pointerMode, tagName);
      self.$debug("同一チャンネル特定タグ(ポイント)の表示");
      output = "";
      if ((($a = (tagName['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        output = $rb_plus(output, "" + (tagName) + ":")
      };
      self.$debug("getPointListAtSameChannel @countInfos", self.countInfos);
      characterInfoList = self.$getCharacterInfoList();
      ($a = ($b = characterInfoList.$keys().$sort()).$each, $a.$$p = (TMP_16 = function(characterName){var self = TMP_16.$$s || this, $c, $d, TMP_17, characterInfo = nil, tagText = nil;
if (characterName == null) characterName = nil;
      characterInfo = characterInfoList['$[]'](characterName);
        tagText = "";
        ($c = ($d = characterInfo.$keys().$sort()).$each, $c.$$p = (TMP_17 = function(currentTag){var self = TMP_17.$$s || this, $e, info = nil, currentValue = nil, maxValue = nil;
if (currentTag == null) currentTag = nil;
        if ((($e = (tagName['$empty?']())) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
          } else if ((($e = (tagName['$=='](currentTag))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            } else {
            return nil;
          };
          info = characterInfo['$[]'](currentTag);
          currentValue = info['$[]']("currentValue");
          maxValue = info['$[]']("maxValue");
          tagText = $rb_plus(tagText, "" + (currentValue));
          if ((($e = (maxValue['$nil?']())) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            return nil
            } else {
            return tagText = $rb_plus(tagText, "/" + (maxValue))
          };}, TMP_17.$$s = self, TMP_17.$$arity = 1, TMP_17), $c).call($d);
        if ((($c = (tagText['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return nil
          } else {
          if ((($c = (output['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            output = $rb_plus(output, " ")
          };
          return output = $rb_plus(output, "" + (characterName) + "(" + (tagText) + ")");
        };}, TMP_16.$$s = self, TMP_16.$$arity = 1, TMP_16), $a).call($b);
      return output;
    }, TMP_18.$$arity = 1);

    Opal.defn(self, '$rename_point_counter', TMP_19 = function $$rename_point_counter() {
      var $a, self = this, output = nil, oldName = nil, newName = nil, characterInfoList = nil, counterInfo = nil;

      self.$debug("rename_point_counter @command, @nick", self.command, self.nick);
      output = "1";
      if ((($a = (/^#RENAME!\s*(.+?)\s*\-\>\s*(.+?)(\s|$)/['$=~'](self.command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      oldName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      newName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      self.$debug("oldName, newName", oldName, newName);
      characterInfoList = self.$getCharacterInfoList(self.channel);
      counterInfo = characterInfoList.$delete(oldName);
      if ((($a = (counterInfo['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return output};
      characterInfoList['$[]='](newName, counterInfo);
      output = "" + (oldName) + "->" + (newName);
      return output;
    }, TMP_19.$$arity = 0);

    Opal.defn(self, '$setPointCounters', TMP_20 = function $$setPointCounters(nick, pc, target) {
      var self = this, key = nil;

      key = "" + (nick) + "," + (pc);
      self.$setPointCounter(key, pc);
      key = "" + (nick) + "," + (pc) + "," + (target);
      return self.$setPointCounter(key, target);
    }, TMP_20.$$arity = 3);

    Opal.defn(self, '$setPointCounter', TMP_21 = function $$setPointCounter(key, data) {
      var $a, self = this, cnt_list = nil;
      if ($gvars.point_counter == null) $gvars.point_counter = nil;

      self.$debug("setPointCounter begin key, data", key, data);
      if ((($a = ($gvars.point_counter['$include?'](key))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("$point_counterにkeyが存在しないので新規作成");
        $gvars.point_counter['$[]='](key, data);
        return nil;
      };
      self.$debug("$point_counterにkeyが存在する場合");
      cnt_list = $gvars.point_counter['$[]'](key);
      if ((($a = (cnt_list['$include?'](data))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return cnt_list['$<<'](data)
      };
    }, TMP_21.$$arity = 2);

    Opal.defn(self, '$sort_point_hash', TMP_23 = function $$sort_point_hash(base_hash) {
      var $a, $b, TMP_22, self = this, keys = nil, pc_sorted = nil;

      keys = base_hash.$keys();
      pc_sorted = ($a = ($b = keys).$sort_by, $a.$$p = (TMP_22 = function(a, b){var self = TMP_22.$$s || this, $c, $d, a_current = nil, a_max = nil, b_current = nil, b_max = nil, compare = nil;
if (a == null) a = nil;if (b == null) b = nil;
      $d = self.$getPointHashCurrentAndMax(a), $c = Opal.to_ary($d), a_current = ($c[0] == null ? nil : $c[0]), a_max = ($c[1] == null ? nil : $c[1]), $d;
        $d = self.$getPointHashCurrentAndMax(b), $c = Opal.to_ary($d), b_current = ($c[0] == null ? nil : $c[0]), b_max = ($c[1] == null ? nil : $c[1]), $d;
        compare = (self.$b_crr()['$<=>'](self.$a_crr()));
        if ((($c = (compare['$=='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          compare = (a_max['$<=>'](b_max));
          if ((($c = (compare['$=='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            compare = (a['$<=>'](b))};};
        return compare;}, TMP_22.$$s = self, TMP_22.$$arity = 2, TMP_22), $a).call($b);
      return pc_sorted;
    }, TMP_23.$$arity = 1);

    return (Opal.defn(self, '$getPointHashCurrentAndMax', TMP_24 = function $$getPointHashCurrentAndMax(key) {
      var $a, self = this, current = nil, max = nil;

      if ((($a = (/(\d+)[\/](\d+)/['$=~'](key))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        current = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        max = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
        return [current, max];};
      return [0, 0];
    }, TMP_24.$$arity = 1), nil) && 'getPointHashCurrentAndMax';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["kconv"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  return nil
};

/* Generated by Opal 0.10.5 */
Opal.modules["CardTrader"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$attr_accessor', '$attr_reader', '$initValues', '$set1Deck1Joker', '$card_place=', '$debug', '$clone', '$lambda', '$sendMessageToOnlySender', '$each', '$to_proc', '$sleep', '$=~', '$to_i', '$>', '$sendMessageToChannels', '$readExtraCard', '$to_s', '$sendMessage', '$nil?', '$empty?', '$readlines', '$push', '$[]=', '$raise', '$+', '$===', '$shuffleCards', '$drawCardByCommandText', '$drawCardOpen', '$getHandAndPlaceCardInfoText', '$playCardByCommandText', '$returnCards', '$clearAllPlaceAllPlayerCards', '$reviewCards', '$getAllCardLocation', '$transferCardsByCommandText', '$pickupCardCommandText', '$backCardCommandText', '$dealCard', '$lookAndDealCard', '$discardCardCommandText', '$sendCardToTargetNickPlaceCommandText', '$tapCardCommandText', '$printCardRestorationSpellResult', '$printMilStoneResult', '$drawCard', '$length', '$getCardsTextFromCards', '$[]', '$upcase', '$<=', '$times', '$ejectOneCardRandomFromCards', '$<<', '$pickupCard', '$!=', '$getCardsText', '$pickupCardByCardName', '$join', '$split', '$pickupCardByCards', '$pickupOneCard', '$==', '$delete_if', '$backCard', '$backCardByCommandSetAndPlace', '$backOneCard', '$getBurriedCard', '$transferOneCard', '$sendDealResult', '$discardCards', '$playCard', '$playCardByCardsBlockTextAndPlaceNo', '$playCardByCardsTextAndPlaceNo', '$playCardByCardAndPlaceNo', '$playOneCard', '$discardOneCard', '$discardCardsByCommandSetAndPlaceAndDestination', '$discardCardsByCardsAndPlace', '$getDestinationWhenPlaceIsNotHand', '$getCardsFromDealCards', '$reject!', '$!', '$transferCards', '$<', '$transferCardsByCommand', '$transferCardsByCards', '$transferTargetCard', '$transferTargetCardToNewMember', '$roll', '$-', '$delete_at', '$getSendCardToTargetNickPlace', '$printRegistCardResult', '$okCards', '$getSendCardToTargetNickPlaceByCardSetAndDestination', '$getSendCardToTargetNickPlaceByCards', '$tapCard', '$tapCardByCardsTextAndPlace', '$tapOneCardByCardAndPlace', '$*', '$getCardMilstone', '$clearAllPlayerCardsWhenPlayedPlace', '$clearAllPlayerCards', '$clear', '$shift', '$getCardLocationOnPlace', '$getCardLocationOnNumberdPlace', '$isTapCardPlace', '$getHandCardInfoText', '$getPlaceCardInfoText', '$getDealCardsText', '$compareCardByCardNumber', '$<=>', '$sort', '$compareCard', '$%', '$throwCardRestorationSpell', '$getNewSpellText', '$setNewSpellText', '$keys', '$getSpellWords', '$getDealCardIndex', '$getIndexWord', '$shrinkSpellWords', '$each_with_index', '$include?', '$gsub', '$pop', '$expandSpellWords', '$getCardsFromIndexWordAndSpellText']);
  self.$require("configBcDice.rb");
  $gvars.ircNickRegExp = "[A-Za-z\\d\\-\\[\\]\\'^{}_]+";
  return (function($base, $super) {
    function $CardTrader(){};
    var self = $CardTrader = $klass($base, $super, 'CardTrader', $CardTrader);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_25, TMP_26, TMP_27, TMP_28, TMP_30, TMP_32, TMP_33, TMP_34, TMP_36, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_43, TMP_44, TMP_45, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_53, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_60, TMP_62, TMP_63, TMP_64, TMP_66, TMP_67, TMP_68, TMP_69, TMP_70, TMP_72, TMP_73, TMP_74, TMP_75, TMP_77, TMP_78, TMP_79, TMP_80, TMP_82, TMP_83, TMP_84, TMP_85, TMP_86, TMP_87, TMP_89, TMP_90, TMP_91, TMP_92, TMP_93, TMP_94, TMP_95, TMP_96, TMP_98, TMP_99, TMP_102, TMP_103, TMP_104, TMP_105, TMP_106, TMP_108, TMP_109, TMP_111, TMP_114, TMP_116, TMP_119, TMP_122;

    def.card_place = def.card_val = def.tnick = def.bcdice = def.channel = def.nick_e = def.cardRegExp = def.card_channels = def.cardRest = def.deal_cards = def.cardTitles = def.canTapCard = def.card_spell = nil;
    self.$attr_accessor("card_place");

    self.$attr_accessor("canTapCard");

    self.$attr_reader("numOfDecks");

    self.$attr_reader("numOfJokers");

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var self = this;

      self.$initValues();
      self.card_channels = $hash2([], {});
      return self.card_spell = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
    }, TMP_1.$$arity = 0);

    Opal.defn(self, '$initValues', TMP_2 = function $$initValues() {
      var $a, $b, self = this;

      self.cardTitles = $hash2([], {});
      self.cardRegExp = "[DHSCJdhscj][\\d]+";
      self.deal_cards = $hash2(["card_played"], {"card_played": []});
      self.$set1Deck1Joker();
      (($a = [1]), $b = self, $b['$card_place='].apply($b, $a), $a[$a.length-1]);
      return self.canTapCard = true;
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$card_place=', TMP_3 = function(place) {
      var self = this;

      self.card_place = place;
      return self.$debug("setCardPlace @card_place", self.card_place);
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$set1Deck1Joker', TMP_4 = function $$set1Deck1Joker() {
      var self = this;

      self.card_val = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "J1"];
      self.cardRest = self.card_val.$clone();
      self.numOfDecks = 1;
      self.numOfJokers = 1;
      return self;
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$set1Deck2Jokers', TMP_5 = function $$set1Deck2Jokers() {
      var self = this;

      self.card_val = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "J1", "J0"];
      self.cardRest = self.card_val.$clone();
      self.numOfDecks = 1;
      self.numOfJokers = 2;
      return self;
    }, TMP_5.$$arity = 0);

    Opal.defn(self, '$set2Decks2Jokers', TMP_6 = function $$set2Decks2Jokers() {
      var self = this;

      self.card_val = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "h10", "h11", "h12", "h13", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10", "d11", "d12", "d13", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "c13", "J1", "J2", "J3", "J4"];
      self.cardRest = self.card_val.$clone();
      self.numOfDecks = 2;
      self.numOfJokers = 2;
      return self;
    }, TMP_6.$$arity = 0);

    Opal.defn(self, '$setBcDice', TMP_7 = function $$setBcDice(bcDice) {
      var self = this;

      return self.bcdice = bcDice;
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$setNick', TMP_8 = function $$setNick(nick_e) {
      var self = this;

      return self.nick_e = nick_e;
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$setTnick', TMP_9 = function $$setTnick(t) {
      var self = this;

      return self.tnick = t;
    }, TMP_9.$$arity = 1);

    Opal.defn(self, '$printCardHelp', TMP_12 = function $$printCardHelp() {
      var $a, $b, TMP_10, $c, TMP_11, $d, $e, self = this, send_to_sender = nil;

      send_to_sender = ($a = ($b = self).$lambda, $a.$$p = (TMP_10 = function(message){var self = TMP_10.$$s || this;
if (message == null) message = nil;
      return self.$sendMessageToOnlySender(message)}, TMP_10.$$s = self, TMP_10.$$arity = 1, TMP_10), $a).call($b);
      ($a = ($c = [["・カードを引く　　　　　　　(c-draw[n]) (nは枚数)", "・オープンでカードを引く　　(c-odraw[n])", "・カードを選んで引く　　　　(c-pick[c[,c]]) (cはカード。カンマで複数指定可)", "・捨てたカードを手札に戻す　(c-back[c[,c]])", "・置いたカードを手札に戻す　(c-back1[c[,c]])"], ["・手札と場札を見る　　　　　(c-hand) (Talk可)", "・カードを出す　　　　　　　(c-play[c[,c]]", "・カードを場に出す　　　　　(c-play1[c[,c]]", "・カードを捨てる　　　　　　(c-discard[c[,c]]) (Talk可)", "・場のカードを選んで捨てる　(c-discard1[c[,c]])", "・山札からめくって捨てる　  (c-milstone[n])"], ["・カードを相手に一枚渡す　　(c-pass[c]相手) (カード指定が無いときはランダム)", "・場のカードを相手に渡す　　(c-pass1[c]相手) (カード指定が無いときはランダム)", "・カードを相手の場に出す　　(c-place[c[,c]]相手)", "・場のカードを相手の場に出す(c-place1[c[,c]]相手)"], ["・場のカードをタップする　　(c-tap1[c[,c]]相手)", "・場のカードをアンタップする(c-untap1[c[,c]]相手)", "  ---"]]).$each, $a.$$p = (TMP_11 = function(messages){var self = TMP_11.$$s || this, $d, $e;
if (messages == null) messages = nil;
      ($d = ($e = messages).$each, $d.$$p = send_to_sender.$to_proc(), $d).call($e);
        return self.$sleep(1);}, TMP_11.$$s = self, TMP_11.$$arity = 1, TMP_11), $a).call($c);
      self.$sleep(1);
      ($a = ($d = ["・カードを配る　　　　　　　(c-deal[n]相手)", "・カードを見てから配る　　　(c-vdeal[n]相手)", "・カードのシャッフル　　　　(c-shuffle)", "・捨てカードを山に戻す　　　(c-rshuffle)", "・全員の場のカードを捨てる　(c-clean)"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($d);
      self.$sleep(1);
      ($a = ($e = ["・相手の手札と場札を見る　　(c-vhand) (Talk不可)", "・枚数配置を見る　　　　　　(c-check)", "・復活の呪文　　　　　　　　(c-spell[呪文]) (c-spellで呪文の表示)"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($e);
      return self.$sendMessageToOnlySender("  -- END ---");
    }, TMP_12.$$arity = 0);

    Opal.defn(self, '$setCardMode', TMP_13 = function $$setCardMode() {
      var $a, self = this;

      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      self.card_place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
      if ((($a = ($rb_gt(self.card_place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("カード置き場ありに変更しました")
        } else {
        return self.$sendMessageToChannels("カード置き場無しに変更しました")
      };
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$readCardSet', TMP_14 = function $$readCardSet() {
      var self = this, e = nil;

      try {
        self.$readExtraCard(self.tnick);
        return self.$sendMessageToOnlySender("カードセットの読み込み成功しました");
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            return self.$sendMessageToOnlySender(e.$to_s())
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$sendMessage', TMP_15 = function $$sendMessage(to, message) {
      var self = this;

      return self.bcdice.$sendMessage(to, message);
    }, TMP_15.$$arity = 2);

    Opal.defn(self, '$sendMessageToOnlySender', TMP_16 = function $$sendMessageToOnlySender(message) {
      var self = this;

      return self.bcdice.$sendMessageToOnlySender(message);
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$sendMessageToChannels', TMP_17 = function $$sendMessageToChannels(message) {
      var self = this;

      return self.bcdice.$sendMessageToChannels(message);
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$readExtraCard', TMP_19 = function $$readExtraCard(cardFileName) {
      var $a, $b, TMP_18, self = this, lines = nil, e = nil;

      if ((($a = (cardFileName['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (cardFileName['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.$debug("Loading Cardset『" + (cardFileName) + "』...\n");
      self.card_val = [];
      try {
        lines = $scope.get('File').$readlines(cardFileName);
        ($a = ($b = lines).$each, $a.$$p = (TMP_18 = function(line){var self = TMP_18.$$s || this, $c, cardNumber = nil, cardTitle = nil;
          if (self.card_val == null) self.card_val = nil;
          if (self.cardTitles == null) self.cardTitles = nil;
if (line == null) line = nil;
        if ((($c = (/^(\d+)->(.+)$/['$=~'](line))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            return nil;
          };
          cardNumber = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1)).$to_i();
          cardTitle = (($c = $gvars['~']) === nil ? nil : $c['$[]'](2));
          self.card_val.$push(cardNumber);
          return self.cardTitles['$[]='](cardNumber, cardTitle);}, TMP_18.$$s = self, TMP_18.$$arity = 1, TMP_18), $a).call($b);
        self.cardRegExp = "[\\d]+";
        self.cardRest = self.card_val.$clone();
        self.deal_cards = $hash2(["card_played"], {"card_played": []});
        return self.$debug("Load Finished...\n");
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            return self.$raise($rb_plus("カードデータを開けません :『" + (cardFileName) + "』", e.$to_s()))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_19.$$arity = 1);

    Opal.defn(self, '$executeCard', TMP_20 = function $$executeCard(arg, channel) {
      var $a, $b, self = this, card_ok = nil, count = nil, $case = nil, output_msg = nil, value = nil, name = nil, messageText = nil, out_msg = nil, place_msg = nil, sendTo = nil, targetNick = nil, spellText = nil, commandText = nil;
      if ($gvars.ircNickRegExp == null) $gvars.ircNickRegExp = nil;

      self.channel = channel;
      self.$debug("executeCard arg", arg);
      if ((($a = (/(c-)/['$=~'](arg))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      card_ok = 0;
      count = 0;
      return (function() {$case = arg;if (/(c-shuffle|c-sh)($|\s)/['$===']($case)) {output_msg = self.$shuffleCards();
      return self.$sendMessage(self.channel, output_msg);}else if (/c-draw(\[[\d]+\])?($|\s)/['$===']($case)) {return self.$drawCardByCommandText(arg)}else if (/(c-odraw|c-opend)(\[[\d]+\])?($|\s)/['$===']($case)) {value = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      return self.$drawCardOpen(value);}else if (/c-hand($|\s)/['$===']($case)) {return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText(arg, self.nick_e))}else if ((new RegExp("c-vhand\\s*(" + $gvars.ircNickRegExp + ")($|\\s)"))['$===']($case)) {name = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      self.$debug("c-vhand name", name);
      messageText = ($rb_plus($rb_plus("" + (name) + " の手札は", self.$getHandAndPlaceCardInfoText("c-hand", name)), "です"));
      return self.$sendMessageToOnlySender(messageText);}else if ((new RegExp("c-play(\\d*)\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\]($|\\s)"))['$===']($case)) {return self.$playCardByCommandText(arg)}else if (/(c-rshuffle|c-rsh)($|\s)/['$===']($case)) {output_msg = self.$returnCards();
      return self.$sendMessage(self.channel, output_msg);}else if (/c-clean($|\s)/['$===']($case)) {output_msg = self.$clearAllPlaceAllPlayerCards();
      return self.$sendMessage(self.channel, output_msg);}else if (/c-review($|\s)/['$===']($case)) {output_msg = self.$reviewCards();
      return self.$sendMessageToOnlySender(output_msg);}else if (/c-check($|\s)/['$===']($case)) {$b = self.$getAllCardLocation(), $a = Opal.to_ary($b), out_msg = ($a[0] == null ? nil : $a[0]), place_msg = ($a[1] == null ? nil : $a[1]), $b;
      self.$sendMessage(self.channel, out_msg);
      return self.$sendMessage(self.channel, place_msg);}else if ((new RegExp("c-pass(\\d)*(\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\])?\\s*(" + $gvars.ircNickRegExp + ")($|\\s)"))['$===']($case)) {sendTo = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      return self.$transferCardsByCommandText(arg, sendTo);}else if ((new RegExp("c-pick\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\]($|\\s)"))['$===']($case)) {return self.$pickupCardCommandText(arg)}else if ((new RegExp("c-back(\\d)*\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\]($|\\s)"))['$===']($case)) {return self.$backCardCommandText(arg)}else if ((new RegExp("c-deal(\\[[\\d]+\\]|\\s)\\s*(" + $gvars.ircNickRegExp + ")($|\\s)"))['$===']($case)) {count = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      targetNick = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      return self.$dealCard(count, targetNick);}else if ((new RegExp("c-vdeal(\\[[\\d]+\\]|\\s)\\s*(" + $gvars.ircNickRegExp + ")($|\\s)"))['$===']($case)) {count = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      targetNick = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      return self.$lookAndDealCard(count, targetNick);}else if ((new RegExp("c-(dis|discard)(\\d)*\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\]($|\\s)"))['$===']($case)) {return self.$discardCardCommandText(arg)}else if ((new RegExp("c-place(\\d)*(\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\])?\\s*(" + $gvars.ircNickRegExp + ")($|\\s)"))['$===']($case)) {targetNick = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      return self.$sendCardToTargetNickPlaceCommandText(arg, targetNick);}else if ((new RegExp("c-(un)?tap(\\d+)\\[" + self.cardRegExp + "(," + self.cardRegExp + ")*\\]($|\\s)"))['$===']($case)) {return self.$tapCardCommandText(arg)}else if ((new RegExp("c-spell(\\[(" + $gvars.ircNickRegExp + "[^\\]]+?)\\])?($|\\s)"))['$===']($case)) {spellText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      return self.$printCardRestorationSpellResult(spellText);}else if (/(c-mil(stone)?(\[[\d]+\])?)($|\s)/['$===']($case)) {commandText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      return self.$printMilStoneResult(commandText);}else { return nil }})();
    }, TMP_20.$$arity = 2);

    Opal.defn(self, '$shuffleCards', TMP_21 = function $$shuffleCards() {
      var self = this;

      self.cardRest = self.card_val.$clone();
      self.deal_cards = $hash2(["card_played"], {"card_played": []});
      return "シャッフルしました";
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$drawCardByCommandText', TMP_22 = function $$drawCardByCommandText(arg) {
      var $a, $b, $c, self = this, cards = nil;

      self.$debug("drawCardByCommandText arg", arg);
      cards = self.$drawCard(arg);
      self.$debug("drawCardByCommandText cards", cards);
      if ((($a = ($rb_gt(cards.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessageToOnlySender(self.$getCardsTextFromCards(cards));
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (cards.$length()) + "枚引きました");
        } else {
        self.$sendMessage(self.channel, "カードが残っていません")
      };
      return ($a = self.nick_e, $b = self.card_channels, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, self.channel)));
    }, TMP_22.$$arity = 1);

    Opal.defn(self, '$drawCardOpen', TMP_23 = function $$drawCardOpen(value) {
      var $a, $b, $c, self = this, cmd = nil, cards = nil;

      cmd = "c-draw";
      if ((($a = (value['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        cmd = $rb_plus(cmd, value)
      };
      cards = self.$drawCard(cmd);
      if ((($a = ($rb_gt(cards.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, $rb_plus($rb_plus("" + (self.nick_e) + ": ", self.$getCardsTextFromCards(cards)), "を引きました"))
        } else {
        self.$sendMessage(self.channel, "カードが残っていません")
      };
      return ($a = self.nick_e, $b = self.card_channels, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, self.channel)));
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$drawCard', TMP_25 = function $$drawCard(command, destination) {
      var $a, $b, TMP_24, self = this, outputCards = nil, count = nil;

      if (destination == null) {
        destination = nil;
      }
      ((($a = destination) !== false && $a !== nil && $a != null) ? $a : destination = self.nick_e);
      destination = destination.$upcase();
      self.$debug("drawCard command, destination", command, destination);
      outputCards = [];
      self.$debug("@cardRest.length", self.cardRest.$length());
      if ((($a = ($rb_le(self.cardRest.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return outputCards};
      if ((($a = (/(c-draw(\[([\d]+)\])?)/['$=~'](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return outputCards
      };
      count = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      ((($a = count) !== false && $a !== nil && $a != null) ? $a : count = 1);
      count = count.$to_i();
      self.$debug("draw count", count);
      (function(){var $brk = Opal.new_brk(); try {return ($a = ($b = count).$times, $a.$$p = (TMP_24 = function(i){var self = TMP_24.$$s || this, $c, $d, $e, card = nil;
        if (self.cardRest == null) self.cardRest = nil;
        if (self.deal_cards == null) self.deal_cards = nil;
if (i == null) i = nil;
      if ((($c = ($rb_le(self.cardRest.$length(), 0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          
          Opal.brk(nil, $brk)};
        card = self.$ejectOneCardRandomFromCards(self.cardRest);
        if ((($c = (card['$nil?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          
          Opal.brk(nil, $brk)};
        ($c = destination, $d = self.deal_cards, ((($e = $d['$[]']($c)) !== false && $e !== nil && $e != null) ? $e : $d['$[]=']($c, [])));
        self.deal_cards['$[]'](destination)['$<<'](card);
        return outputCards['$<<'](card);}, TMP_24.$$s = self, TMP_24.$$brk = $brk, TMP_24.$$arity = 1, TMP_24), $a).call($b)
      } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
      return outputCards;
    }, TMP_25.$$arity = -2);

    Opal.defn(self, '$pickupCardCommandText', TMP_26 = function $$pickupCardCommandText(string) {
      var $a, $b, self = this, count = nil, output_msg = nil;

      self.$debug("pickupCardCommandText string", string);
      $b = self.$pickupCard(string), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (count) + "枚選んで引きました")};
      if ((($a = (output_msg['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, $rb_plus($rb_plus("[", self.$getCardsText(output_msg)), "]がありません"))};
      return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto"));
    }, TMP_26.$$arity = 1);

    Opal.defn(self, '$pickupCard', TMP_27 = function $$pickupCard(string) {
      var $a, $b, self = this, okCount = nil, ngCardList = nil, cardName = nil, ngCardText = nil;

      okCount = 0;
      ngCardList = [];
      if ((($a = ((new RegExp("(c-pick\\[((,)?" + self.cardRegExp + ")+\\])"))['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        $b = self.$pickupCardByCardName(cardName), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;};
      ngCardText = ngCardList.$join(",");
      return [okCount, ngCardText];
    }, TMP_27.$$arity = 1);

    Opal.defn(self, '$pickupCardByCardName', TMP_28 = function $$pickupCardByCardName(cardName) {
      var $a, $b, self = this, okCount = nil, ngCardList = nil, cards = nil;

      okCount = 0;
      ngCardList = [];
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](cardName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/);
        $b = self.$pickupCardByCards(cards), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;};
      return [okCount, ngCardList];
    }, TMP_28.$$arity = 1);

    Opal.defn(self, '$pickupCardByCards', TMP_30 = function $$pickupCardByCards(cards) {
      var $a, $b, TMP_29, self = this, okCount = nil, ngCardList = nil;

      okCount = 0;
      ngCardList = [];
      ($a = ($b = cards).$each, $a.$$p = (TMP_29 = function(card){var self = TMP_29.$$s || this, $c, string = nil;
        if ($gvars.okResult == null) $gvars.okResult = nil;
if (card == null) card = nil;
      string = self.$pickupOneCard(card);
        if ((($c = (string['$==']($gvars.okResult))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return okCount = $rb_plus(okCount, 1)
          } else {
          return ngCardList['$<<'](string)
        };}, TMP_29.$$s = self, TMP_29.$$arity = 1, TMP_29), $a).call($b);
      return [okCount, ngCardList];
    }, TMP_30.$$arity = 1);

    Opal.defn(self, '$pickupOneCard', TMP_32 = function $$pickupOneCard(card) {
      var $a, $b, TMP_31, $c, $d, self = this, targetCard = nil, destination = nil, isDelete = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      if ((($a = ($rb_le(self.cardRest.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "山札"};
      targetCard = card.$upcase();
      destination = self.nick_e.$upcase();
      isDelete = ($a = ($b = self.cardRest).$delete_if, $a.$$p = (TMP_31 = function(card){var self = TMP_31.$$s || this;
if (card == null) card = nil;
      return card['$=='](targetCard)}, TMP_31.$$s = self, TMP_31.$$arity = 1, TMP_31), $a).call($b);
      if ((($a = (isDelete)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        ($a = destination, $c = self.deal_cards, ((($d = $c['$[]']($a)) !== false && $d !== nil && $d != null) ? $d : $c['$[]=']($a, [])));
        self.deal_cards['$[]'](destination)['$<<'](targetCard);
        return $gvars.okResult;
        } else {
        return targetCard
      };
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$backCardCommandText', TMP_33 = function $$backCardCommandText(command) {
      var $a, $b, self = this, count = nil, output_msg = nil;

      $b = self.$backCard(command), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (count) + "枚戻しました")};
      if ((($a = (output_msg['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessage(self.channel, "[" + (self.$getCardsText(output_msg)) + "]がありません")
        } else {
        return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto"))
      };
    }, TMP_33.$$arity = 1);

    Opal.defn(self, '$backCard', TMP_34 = function $$backCard(command) {
      var $a, $b, self = this, okCount = nil, ngCards = nil, commandset = nil, place = nil;

      okCount = 0;
      ngCards = [];
      if ((($a = ((new RegExp("(c-back(\\d*)\\[((,)?" + self.cardRegExp + ")+\\])"))['$=~'](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        commandset = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
        $b = self.$backCardByCommandSetAndPlace(commandset, place), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCards = ($a[1] == null ? nil : $a[1]), $b;};
      return [okCount, ngCards.$join(",")];
    }, TMP_34.$$arity = 1);

    Opal.defn(self, '$backCardByCommandSetAndPlace', TMP_36 = function $$backCardByCommandSetAndPlace(commandset, place) {
      var $a, $b, TMP_35, self = this, okCount = nil, ngCards = nil, destination = nil, cards = nil;

      okCount = 0;
      ngCards = [];
      destination = self.nick_e.$upcase();
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](commandset))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/);
        ($a = ($b = cards).$each, $a.$$p = (TMP_35 = function(card){var self = TMP_35.$$s || this, $c, string = nil;
          if ($gvars.okResult == null) $gvars.okResult = nil;
if (card == null) card = nil;
        string = self.$backOneCard(card, destination, place);
          if ((($c = (string['$==']($gvars.okResult))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return okCount = $rb_plus(okCount, 1)
            } else {
            return ngCards['$<<'](string)
          };}, TMP_35.$$s = self, TMP_35.$$arity = 1, TMP_35), $a).call($b);};
      return [okCount, ngCards];
    }, TMP_36.$$arity = 2);

    Opal.defn(self, '$backOneCard', TMP_38 = function $$backOneCard(targetCard, destination, place) {
      var $a, $b, $c, TMP_37, self = this, string = nil, cards = nil, isDelete = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      if ((($a = ($rb_le(self.$getBurriedCard(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "捨て札"};
      targetCard = targetCard.$upcase();
      if ((($a = ($rb_gt(self.card_place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        string = self.$transferOneCard(targetCard, "" + (place) + (destination), destination);
        if ((($a = (string['$==']($gvars.okResult))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return $gvars.okResult};};
      ($a = "card_played", $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      cards = self.deal_cards['$[]']("card_played");
      isDelete = ($a = ($b = cards).$delete_if, $a.$$p = (TMP_37 = function(i){var self = TMP_37.$$s || this;
if (i == null) i = nil;
      return i['$=='](targetCard)}, TMP_37.$$s = self, TMP_37.$$arity = 1, TMP_37), $a).call($b);
      if ((($a = (isDelete)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.deal_cards['$[]'](destination)['$<<'](targetCard);
        return $gvars.okResult;};
      return "${targetCard}";
    }, TMP_38.$$arity = 3);

    Opal.defn(self, '$dealCard', TMP_39 = function $$dealCard(count, targetNick, isLook) {
      var $a, $b, $c, self = this, cards = nil;

      if (isLook == null) {
        isLook = false;
      }
      self.$debug("dealCard count, targetNick", count, targetNick);
      cards = self.$drawCard("c-draw" + (count), targetNick);
      if ((($a = ($rb_gt(cards.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendDealResult(targetNick, count, self.$getCardsTextFromCards(cards), isLook)
        } else {
        self.$sendMessage(self.channel, "カードが残っていません")
      };
      ($a = targetNick, $b = self.card_channels, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, self.channel)));
      return count;
    }, TMP_39.$$arity = -3);

    Opal.defn(self, '$sendDealResult', TMP_40 = function $$sendDealResult(targetNick, count, output_msg, isLook) {
      var $a, self = this;

      self.$sendMessage(targetNick, output_msg);
      if ((($a = (isLook)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.nick_e, "" + (targetNick) + " に " + (output_msg) + " を配りました")};
      return self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (targetNick) + "に" + (count) + "枚配りました");
    }, TMP_40.$$arity = 4);

    Opal.defn(self, '$lookAndDealCard', TMP_41 = function $$lookAndDealCard(count, targetNick) {
      var self = this, isLook = nil;

      isLook = true;
      return self.$dealCard(count, targetNick, isLook);
    }, TMP_41.$$arity = 2);

    Opal.defn(self, '$discardCardCommandText', TMP_42 = function $$discardCardCommandText(commandText) {
      var $a, $b, self = this, count = nil, output_msg = nil, card_ok = nil, cardText = nil;
      if ($gvars.card_ok == null) $gvars.card_ok = nil;

      $b = self.$discardCards(commandText), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), card_ok = ($a[2] == null ? nil : $a[2]), $b;
      if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (count) + "枚捨てました");
        if ((($a = (self.cardTitles['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          cardText = self.$getCardsText($gvars.card_ok);
          self.$sendMessage(self.channel, "[" + (cardText) + "]");
        };};
      if ((($a = (output_msg['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardText = self.$getCardsText(output_msg);
        return self.$sendMessageToOnlySender("[" + (cardText) + "]がありません");
        } else {
        return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto"))
      };
    }, TMP_42.$$arity = 1);

    Opal.defn(self, '$playCardByCommandText', TMP_43 = function $$playCardByCommandText(arg) {
      var $a, $b, self = this, count = nil, output_msg = nil, card_ok = nil;
      if ($gvars.card_ok == null) $gvars.card_ok = nil;

      self.$debug("c-play pattern", arg);
      $b = self.$playCard(arg), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), card_ok = ($a[2] == null ? nil : $a[2]), $b;
      if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (count) + "枚出しました");
        if ((($a = (self.cardTitles['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$sendMessage(self.channel, $rb_plus($rb_plus("[", self.$getCardsText($gvars.card_ok)), "]"))
        };};
      if ((($a = (output_msg['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("output_msg", output_msg);
        self.$sendMessage(self.channel, $rb_plus($rb_plus("[", self.$getCardsText(output_msg)), "]は持っていません"));};
      return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto", self.nick_e));
    }, TMP_43.$$arity = 1);

    Opal.defn(self, '$playCard', TMP_44 = function $$playCard(cardPlayCommandText) {
      var $a, $b, self = this, okCardCount = nil, okCardList = nil, ngCardList = nil, cardsBlockText = nil, place = nil, okCardText = nil, ngCardText = nil;

      self.$debug("playCard cardPlayCommandText", cardPlayCommandText);
      okCardCount = 0;
      okCardList = [];
      ngCardList = [];
      if ((($a = ((new RegExp("(c-play(\\d*)\\[((,)?" + self.cardRegExp + ")+\\])"))['$=~'](cardPlayCommandText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardsBlockText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
        self.$debug("cardsBlockText", cardsBlockText);
        self.$debug("place", place);
        $b = self.$playCardByCardsBlockTextAndPlaceNo(cardsBlockText, place), $a = Opal.to_ary($b), okCardList = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;
        self.$debug("okCardList", okCardList);
        self.$debug("ngCardList", ngCardList);
        okCardCount = okCardList.$length();
        okCardText = okCardList.$join(",");
        ngCardText = ngCardList.$join(",");};
      return [okCardCount, ngCardText, okCardText];
    }, TMP_44.$$arity = 1);

    Opal.defn(self, '$playCardByCardsBlockTextAndPlaceNo', TMP_45 = function $$playCardByCardsBlockTextAndPlaceNo(cardsBlockText, place) {
      var $a, $b, self = this, okCardList = nil, ngCardList = nil, cardsText = nil;

      okCardList = [];
      ngCardList = [];
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](cardsBlockText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardsText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        $b = self.$playCardByCardsTextAndPlaceNo(cardsText, place), $a = Opal.to_ary($b), okCardList = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;};
      return [okCardList, ngCardList];
    }, TMP_45.$$arity = 2);

    Opal.defn(self, '$playCardByCardsTextAndPlaceNo', TMP_47 = function $$playCardByCardsTextAndPlaceNo(cardsText, place) {
      var $a, $b, TMP_46, self = this, cards = nil, okCardList = nil, ngCardList = nil;

      cards = cardsText.$split(/,/);
      okCardList = [];
      ngCardList = [];
      ($a = ($b = cards).$each, $a.$$p = (TMP_46 = function(card){var self = TMP_46.$$s || this, $c, $d, okList = nil, ngList = nil;
if (card == null) card = nil;
      $d = self.$playCardByCardAndPlaceNo(card, place), $c = Opal.to_ary($d), okList = ($c[0] == null ? nil : $c[0]), ngList = ($c[1] == null ? nil : $c[1]), $d;
        okCardList = $rb_plus(okCardList, okList);
        return ngCardList = $rb_plus(ngCardList, ngList);}, TMP_46.$$s = self, TMP_46.$$arity = 1, TMP_46), $a).call($b);
      return [okCardList, ngCardList];
    }, TMP_47.$$arity = 2);

    Opal.defn(self, '$playCardByCardAndPlaceNo', TMP_48 = function $$playCardByCardAndPlaceNo(card, place) {
      var $a, self = this, okList = nil, ngList = nil, result = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      self.$debug("playCardByCardAndPlaceNo card, place", card, place);
      okList = [];
      ngList = [];
      result = self.$playOneCard(card, place);
      self.$debug("playOneCard result", result);
      if ((($a = (result['$==']($gvars.okResult))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        okList['$<<'](card)
        } else {
        ngList['$<<'](result)
      };
      return [okList, ngList];
    }, TMP_48.$$arity = 2);

    Opal.defn(self, '$playOneCard', TMP_49 = function $$playOneCard(card, place) {
      var $a, self = this, destination = nil, result = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      self.$debug("playOneCard card, place", card, place);
      destination = self.nick_e.$upcase();
      result = "";
      if ((($a = ($rb_gt(place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("playOneCard place > 0");
        result = self.$transferOneCard(card, destination, "" + (place) + (destination));
        } else {
        self.$debug("playOneCard place <= 0");
        result = self.$discardOneCard(card, place, destination);
      };
      if ((($a = (result['$==']($gvars.okResult))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return result
        } else {
        return card
      };
    }, TMP_49.$$arity = 2);

    Opal.defn(self, '$discardCards', TMP_50 = function $$discardCards(command, destination) {
      var $a, $b, self = this, okList = nil, ngList = nil, commandSet = nil, place = nil, ngText = nil, okText = nil;

      if (destination == null) {
        destination = nil;
      }
      self.$debug("discardCards command, destination", command, destination);
      if ((($a = (destination['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        destination = self.nick_e};
      destination = destination.$upcase();
      okList = [];
      ngList = [];
      if ((($a = ((new RegExp("(c-(dis|discard)(\\d*)\\[((,)?" + self.cardRegExp + ")+\\])"))['$=~'](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("discardCards reg OK");
        commandSet = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3)).$to_i();
        $b = self.$discardCardsByCommandSetAndPlaceAndDestination(commandSet, place, destination), $a = Opal.to_ary($b), okList = ($a[0] == null ? nil : $a[0]), ngList = ($a[1] == null ? nil : $a[1]), $b;};
      ngText = ngList.$join(",");
      okText = okList.$join(",");
      return [okList.$length(), ngText, okText];
    }, TMP_50.$$arity = -2);

    Opal.defn(self, '$discardCardsByCommandSetAndPlaceAndDestination', TMP_51 = function $$discardCardsByCommandSetAndPlaceAndDestination(commandSet, place, destination) {
      var $a, $b, self = this, okList = nil, ngList = nil, cards = nil;

      okList = [];
      ngList = [];
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](commandSet))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/);
        $b = self.$discardCardsByCardsAndPlace(cards, place, destination), $a = Opal.to_ary($b), okList = ($a[0] == null ? nil : $a[0]), ngList = ($a[1] == null ? nil : $a[1]), $b;};
      return [okList, ngList];
    }, TMP_51.$$arity = 3);

    Opal.defn(self, '$discardCardsByCardsAndPlace', TMP_53 = function $$discardCardsByCardsAndPlace(cards, place, destination) {
      var $a, $b, TMP_52, self = this, okList = nil, ngList = nil;

      okList = [];
      ngList = [];
      ($a = ($b = cards).$each, $a.$$p = (TMP_52 = function(card){var self = TMP_52.$$s || this, $c, result = nil;
        if ($gvars.okResult == null) $gvars.okResult = nil;
if (card == null) card = nil;
      result = self.$discardOneCard(card, place, destination);
        if ((($c = (result['$==']($gvars.okResult))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return okList['$<<'](card)
          } else {
          return ngList['$<<'](result)
        };}, TMP_52.$$s = self, TMP_52.$$arity = 1, TMP_52), $a).call($b);
      return [okList, ngList];
    }, TMP_53.$$arity = 3);

    Opal.defn(self, '$discardOneCard', TMP_55 = function $$discardOneCard(card, place, destination) {
      var $a, $b, TMP_54, $c, $d, self = this, this_cards = nil, rest_cards = nil, temp_cards = nil, result = nil, isTargetCardInHand = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      card = card.$upcase();
      destination = destination.$upcase();
      destination = self.$getDestinationWhenPlaceIsNotHand(place, destination);
      this_cards = [];
      rest_cards = [];
      temp_cards = self.$getCardsFromDealCards(destination);
      result = ($a = ($b = temp_cards)['$reject!'], $a.$$p = (TMP_54 = function(i){var self = TMP_54.$$s || this;
if (i == null) i = nil;
      return i['$=='](card)}, TMP_54.$$s = self, TMP_54.$$arity = 1, TMP_54), $a).call($b);
      isTargetCardInHand = (result['$nil?']()['$!']());
      if ((($a = (isTargetCardInHand)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        this_cards['$<<'](card)
        } else {
        rest_cards['$<<'](card)
      };
      self.$debug("isTargetCardInHand", isTargetCardInHand);
      if ((($a = (isTargetCardInHand)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("isTargetCardInHand OK, so set card info");
        ($a = destination, $c = self.deal_cards, ((($d = $c['$[]']($a)) !== false && $d !== nil && $d != null) ? $d : $c['$[]=']($a, [])));
        ($a = destination, $c = self.deal_cards, $c['$[]=']($a, $rb_plus($c['$[]']($a), rest_cards)));
        ($a = "card_played", $c = self.deal_cards, ((($d = $c['$[]']($a)) !== false && $d !== nil && $d != null) ? $d : $c['$[]=']($a, [])));
        ($a = "card_played", $c = self.deal_cards, $c['$[]=']($a, $rb_plus($c['$[]']($a), this_cards)));
        self.$debug("@deal_cards", self.deal_cards);
        return $gvars.okResult;
        } else {
        return card
      };
    }, TMP_55.$$arity = 3);

    Opal.defn(self, '$getDestinationWhenPlaceIsNotHand', TMP_56 = function $$getDestinationWhenPlaceIsNotHand(place, destination) {
      var $a, self = this;

      if ((($a = ($rb_gt(place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        destination = "" + (place) + (destination);
        return destination;};
      return destination;
    }, TMP_56.$$arity = 2);

    Opal.defn(self, '$getCardsFromDealCards', TMP_57 = function $$getCardsFromDealCards(destination) {
      var $a, self = this, cards = nil;

      self.$debug("getCardsFromDealCards destination", destination);
      self.$debug("@deal_cards", self.deal_cards);
      self.$debug("@deal_cards[destination]", self.deal_cards['$[]'](destination));
      if ((($a = (self.deal_cards['$[]'](destination)['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("getCardsFromDealCards empty");
        return [];};
      cards = self.deal_cards['$[]'](destination);
      self.$debug("getCardsFromDealCards cards", cards);
      return cards;
    }, TMP_57.$$arity = 1);

    Opal.defn(self, '$transferCardsByCommandText', TMP_58 = function $$transferCardsByCommandText(commandText, sendTo) {
      var $a, $b, self = this, count = nil, output_msg = nil;

      self.$debug("transferCardsByCommandText commandText, sendTo", commandText, sendTo);
      $b = self.$transferCards(commandText), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = ($rb_lt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": 相手が登録されていません")
        } else {
        if ((($a = (output_msg['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$sendMessage(self.channel, $rb_plus($rb_plus("[", self.$getCardsText(output_msg)), "]がありません"))};
        if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (count) + "枚渡しました");
          self.$debug("transferCardsByCommandText sendTo", sendTo);
          self.$sendMessage(sendTo, self.$getHandAndPlaceCardInfoText("Auto", sendTo));};
      };
      return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto"));
    }, TMP_58.$$arity = 2);

    Opal.defn(self, '$transferCards', TMP_59 = function $$transferCards(command) {
      var $a, $b, self = this, okCount = nil, ngCardList = nil, destination = nil, commandset = nil, place = nil, ngCardText = nil;
      if ($gvars.ircNickRegExp == null) $gvars.ircNickRegExp = nil;

      self.$debug("transferCards command", command);
      okCount = 0;
      ngCardList = [];
      if ((($a = ((new RegExp("(c-pass(\\d*)(\\[(((,)?" + self.cardRegExp + ")*)\\])?)\\s*(" + $gvars.ircNickRegExp + ")"))['$=~'](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        destination = (($a = $gvars['~']) === nil ? nil : $a['$[]'](7)).$upcase();
        commandset = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
        ((($a = place) !== false && $a !== nil && $a != null) ? $a : place = 0);
        $b = self.$transferCardsByCommand(commandset, place, destination), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;
        self.$debug("transferCardsByCommand resutl okCount, ngCardList", okCount, ngCardList);};
      ngCardText = ngCardList.$join(",");
      return [okCount, ngCardText];
    }, TMP_59.$$arity = 1);

    Opal.defn(self, '$transferCardsByCommand', TMP_60 = function $$transferCardsByCommand(commandset, place, destination) {
      var $a, $b, self = this, nick_e = nil, okCount = nil, ngCardList = nil, cards = nil;

      self.$debug("transferCardsByCommand commandset, place, destination", commandset, place, destination);
      nick_e = self.nick_e;
      if ((($a = ($rb_gt(place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        nick_e = "" + (place) + (nick_e)};
      okCount = 0;
      ngCardList = [];
      self.$debug("LINE", 898);
      cards = [""];
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](commandset))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/)};
      self.$debug("transferCardsByCommand cards", cards);
      $b = self.$transferCardsByCards(cards, destination, nick_e), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;
      self.$debug("LINE", 908);
      return [okCount, ngCardList];
    }, TMP_60.$$arity = 3);

    Opal.defn(self, '$transferCardsByCards', TMP_62 = function $$transferCardsByCards(cards, destination, nick_e) {try {

      var $a, $b, TMP_61, self = this, okCount = nil, ngCardList = nil;

      okCount = 0;
      ngCardList = [];
      ($a = ($b = cards).$each, $a.$$p = (TMP_61 = function(card){var self = TMP_61.$$s || this, result = nil, $case = nil;
        if ($gvars.ngResult == null) $gvars.ngResult = nil;
        if ($gvars.okResult == null) $gvars.okResult = nil;
if (card == null) card = nil;
      self.$debug("transferCardsByCards card", card);
        result = self.$transferOneCard(card, nick_e, destination);
        self.$debug("transferOneCard result", result);
        return (function() {$case = result;if ($gvars.ngResult['$===']($case)) {Opal.ret([-1, ["渡す相手が登録されていません"]])}else if ($gvars.okResult['$===']($case)) {return okCount = $rb_plus(okCount, 1)}else {return ngCardList['$<<'](result)}})();}, TMP_61.$$s = self, TMP_61.$$arity = 1, TMP_61), $a).call($b);
      return [okCount, ngCardList];
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_62.$$arity = 3);

    Opal.defn(self, '$transferOneCard', TMP_63 = function $$transferOneCard(card, from, toSend) {
      var $a, $b, $c, self = this, targetCard = nil, isTargetCardInHand = nil, restCards = nil, thisCard = nil, cards = nil, isSuccess = nil;
      if ($gvars.ngResult == null) $gvars.ngResult = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      self.$debug("transferOneCard card, from, toSend", card, from, toSend);
      targetCard = card.$upcase();
      toSend = toSend.$upcase();
      from = from.$upcase();
      isTargetCardInHand = false;
      restCards = [];
      thisCard = "";
      ($a = from, $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      cards = self.deal_cards['$[]'](from);
      self.$debug("from, cards, @deal_cards", from, cards, self.deal_cards);
      if ((($a = (targetCard['$=='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("カード指定がないのでランダムで一枚渡す");
        thisCard = self.$ejectOneCardRandomFromCards(cards);
        isTargetCardInHand = true;
        restCards = self.deal_cards['$[]'](from);
        } else {
        self.$debug("カード指定あり targetCard", targetCard);
        $b = self.$transferTargetCard(targetCard, cards, toSend, from), $a = Opal.to_ary($b), thisCard = ($a[0] == null ? nil : $a[0]), restCards = ($a[1] == null ? nil : $a[1]), isTargetCardInHand = ($a[2] == null ? nil : $a[2]), $b;
      };
      self.$debug("transferOneCard isTargetCardInHand", isTargetCardInHand);
      if ((($a = (isTargetCardInHand['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return targetCard};
      self.$debug("transferOneCard @deal_cards", self.deal_cards);
      self.$debug("transferOneCard toSend", toSend);
      if ((($a = (self.deal_cards['$[]'](toSend))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("alreadyRegisted");
        self.deal_cards['$[]'](toSend)['$<<'](thisCard);
        } else {
        self.$debug("NOT registed");
        isSuccess = self.$transferTargetCardToNewMember(toSend, thisCard);
        self.$debug("isSuccess", isSuccess);
        if ((($a = (isSuccess)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          return $gvars.ngResult
        };
      };
      self.deal_cards['$[]='](from, restCards);
      self.$debug("transferOneCard @deal_cards", self.deal_cards);
      return $gvars.okResult;
    }, TMP_63.$$arity = 3);

    Opal.defn(self, '$ejectOneCardRandomFromCards', TMP_64 = function $$ejectOneCardRandomFromCards(cards) {
      var $a, $b, self = this, cardNumber = nil, dummy = nil, card = nil;

      self.$debug("ejectOneCardRandomFromCards cards.length", cards.$length());
      if ((($a = (cards['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      $b = self.bcdice.$roll(1, cards.$length()), $a = Opal.to_ary($b), cardNumber = ($a[0] == null ? nil : $a[0]), dummy = ($a[1] == null ? nil : $a[1]), $b;
      cardNumber = $rb_minus(cardNumber, 1);
      self.$debug("cardNumber", cardNumber);
      card = cards.$delete_at(cardNumber);
      self.$debug("card", card);
      return card;
    }, TMP_64.$$arity = 1);

    Opal.defn(self, '$transferTargetCard', TMP_66 = function $$transferTargetCard(targetCard, cards, toSend, from) {
      var $a, $b, TMP_65, self = this, thisCard = nil, restCards = nil, isTargetCardInHand = nil;

      self.$debug("transferTargetCard(targetCard, cards, toSend, from)", targetCard, cards, toSend, from);
      thisCard = "";
      restCards = [];
      isTargetCardInHand = false;
      ($a = ($b = cards).$each, $a.$$p = (TMP_65 = function(card){var self = TMP_65.$$s || this, $c, $d;
if (card == null) card = nil;
      if ((($c = (($d = (isTargetCardInHand['$!']()), $d !== false && $d !== nil && $d != null ?(card['$=='](targetCard)) : $d))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          isTargetCardInHand = true;
          return thisCard = card;
          } else {
          return restCards['$<<'](card)
        }}, TMP_65.$$s = self, TMP_65.$$arity = 1, TMP_65), $a).call($b);
      self.$debug("restCards", restCards);
      return [thisCard, restCards, isTargetCardInHand];
    }, TMP_66.$$arity = 4);

    Opal.defn(self, '$transferTargetCardToNewMember', TMP_67 = function $$transferTargetCardToNewMember(destination, thisCard) {
      var $a, $b, $c, self = this, isSuccess = nil, placeName = nil;

      self.$debug("transferTargetCardToNewMember destination, thisCard", destination, thisCard);
      self.$debug("@card_place", self.card_place);
      isSuccess = false;
      if ((($a = ($rb_gt(self.card_place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (/^\d+(.+)/['$=~'](destination))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          placeName = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
          self.$debug("placeName", placeName);
          if ((($a = (self.deal_cards['$[]'](placeName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            ($a = destination, $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
            self.deal_cards['$[]'](destination)['$<<'](thisCard);
            isSuccess = true;};}};
      return isSuccess;
    }, TMP_67.$$arity = 2);

    Opal.defn(self, '$sendCardToTargetNickPlaceCommandText', TMP_68 = function $$sendCardToTargetNickPlaceCommandText(commandText, targetNick) {
      var $a, $b, self = this, okCardList = nil, ngCardList = nil, ngCardText = nil;

      self.$debug("sendCardToTargetNickPlaceCommandText commandText, targetNick", commandText, targetNick);
      $b = self.$getSendCardToTargetNickPlace(commandText, targetNick), $a = Opal.to_ary($b), okCardList = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;
      self.$debug("getSendCardToTargetNickPlace okCardList, ngCardList", okCardList, ngCardList);
      if ((($a = ($rb_lt(okCardList.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": 相手が登録されていません");
        return nil;};
      if ((($a = (ngCardList['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        ngCardText = self.$getCardsTextFromCards(ngCardList);
        self.$sendMessage(self.channel, "[" + (ngCardText) + "]がありません");
        return nil;
      };
      if ((($a = ($rb_gt(okCardList.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$printRegistCardResult(targetNick, self.$okCards())};
      return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto"));
    }, TMP_68.$$arity = 2);

    Opal.defn(self, '$getSendCardToTargetNickPlace', TMP_69 = function $$getSendCardToTargetNickPlace(commandText, nick_e) {
      var $a, self = this, ngCardList = nil, okCardList = nil, cardset = nil, placeNumber = nil, destination = nil;
      if ($gvars.ircNickRegExp == null) $gvars.ircNickRegExp = nil;

      ngCardList = [];
      okCardList = [];
      self.$debug("commandText", commandText);
      if ((($a = ((new RegExp("(c-place(\\d*)(\\[(((,)?" + self.cardRegExp + ")*)\\])?)\\s*(" + $gvars.ircNickRegExp + ")"))['$=~'](commandText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardset = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        placeNumber = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
        destination = (($a = $gvars['~']) === nil ? nil : $a['$[]'](7)).$upcase();
        self.$getSendCardToTargetNickPlaceByCardSetAndDestination(cardset, placeNumber, destination);};
      return [okCardList, ngCardList];
    }, TMP_69.$$arity = 2);

    Opal.defn(self, '$getSendCardToTargetNickPlaceByCardSetAndDestination', TMP_70 = function $$getSendCardToTargetNickPlaceByCardSetAndDestination(cardset, placeNumber, destination) {
      var $a, $b, self = this, toSend = nil, from = nil, cards = nil, okCardList = nil, ngCardList = nil;

      self.$debug("getSendCardToTargetNickPlaceByCardSetAndDestination cardset, placeNumber, destination", cardset, placeNumber, destination);
      self.$debug("今のところ場が１つしかないので相手の場は決めうち");
      toSend = "1" + (destination);
      self.$debug("toSend", toSend);
      from = self.nick_e;
      if ((($a = ($rb_gt(placeNumber, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        from = "" + (placeNumber) + (from)};
      self.$debug("from", from);
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](cardset))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/);
        $b = self.$getSendCardToTargetNickPlaceByCards(cards, from, toSend), $a = Opal.to_ary($b), okCardList = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;};
      return [okCardList, ngCardList];
    }, TMP_70.$$arity = 3);

    Opal.defn(self, '$getSendCardToTargetNickPlaceByCards', TMP_72 = function $$getSendCardToTargetNickPlaceByCards(cards, destination, toSend) {try {

      var $a, $b, TMP_71, self = this, okCardList = nil, ngCardList = nil;

      self.$debug("getSendCardToTargetNickPlaceByCards cards, destination, toSend", destination, toSend);
      okCardList = [];
      ngCardList = [];
      ($a = ($b = cards).$each, $a.$$p = (TMP_71 = function(card){var self = TMP_71.$$s || this, result = nil, $case = nil;
        if ($gvars.ngResult == null) $gvars.ngResult = nil;
        if ($gvars.okResult == null) $gvars.okResult = nil;
if (card == null) card = nil;
      result = self.$transferOneCard(card, destination, toSend);
        return (function() {$case = result;if ($gvars.ngResult['$===']($case)) {Opal.ret([-1, "渡す相手が登録されていません"])}else if ($gvars.okResult['$===']($case)) {return okCardList['$<<'](card)}else {return ngCardList['$<<'](result)}})();}, TMP_71.$$s = self, TMP_71.$$arity = 1, TMP_71), $a).call($b);
      return [okCardList, ngCardList];
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_72.$$arity = 3);

    Opal.defn(self, '$printRegistCardResult', TMP_73 = function $$printRegistCardResult(targetNick, okCards) {
      var $a, self = this, cardText = nil;

      self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (okCards.$length()) + "枚場に置きました");
      if ((($a = (self.cardTitles['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        cardText = self.$getCardsTextFromCards(okCards);
        self.$sendMessage(self.channel, "[" + (cardText) + "]");
      };
      return self.$sendMessage(targetNick, self.$getHandAndPlaceCardInfoText("Auto", targetNick));
    }, TMP_73.$$arity = 2);

    Opal.defn(self, '$tapCardCommandText', TMP_74 = function $$tapCardCommandText(commandText) {
      var $a, $b, self = this, okList = nil, ngList = nil, isUntap = nil, tapTypeName = nil;

      self.$debug("tapCardCommandText commandText", commandText);
      $b = self.$tapCard(commandText), $a = Opal.to_ary($b), okList = ($a[0] == null ? nil : $a[0]), ngList = ($a[1] == null ? nil : $a[1]), isUntap = ($a[2] == null ? nil : $a[2]), $b;
      if ((($a = ($rb_gt(okList.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        tapTypeName = ((function() {if (isUntap !== false && isUntap !== nil && isUntap != null) {
          return "アンタップ"
          } else {
          return "タップ"
        }; return nil; })());
        self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (okList.$length()) + "枚" + (tapTypeName) + "しました");
        if ((($a = (self.cardTitles['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$sendMessage(self.channel, "[" + (self.$getCardsTextFromCards(okList)) + "]")
        };};
      if ((($a = ($rb_gt(ngList.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessage(self.channel, "[" + (self.$getCardsTextFromCards(ngList)) + "]は場にありません")};
      return self.$sendMessageToOnlySender(self.$getHandAndPlaceCardInfoText("Auto", self.nick_e));
    }, TMP_74.$$arity = 1);

    Opal.defn(self, '$tapCard', TMP_75 = function $$tapCard(command) {
      var $a, $b, self = this, okCardList = nil, ngCardList = nil, place = nil, isUntap = nil, cardsText = nil;

      okCardList = [];
      ngCardList = [];
      if ((($a = (($b = self.canTapCard, $b !== false && $b !== nil && $b != null ?self.card_place : $b))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [okCardList, ngCardList]
      };
      if ((($a = ((new RegExp("(c-(un)?tap(\\d+)\\[((,)?" + self.cardRegExp + ")+\\])"))['$=~'](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [okCardList, ngCardList]
      };
      place = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3)).$to_i();
      isUntap = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      cardsText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      $b = self.$tapCardByCardsTextAndPlace(cardsText, place, isUntap), $a = Opal.to_ary($b), okCardList = ($a[0] == null ? nil : $a[0]), ngCardList = ($a[1] == null ? nil : $a[1]), $b;
      return [okCardList, ngCardList, isUntap];
    }, TMP_75.$$arity = 1);

    Opal.defn(self, '$tapCardByCardsTextAndPlace', TMP_77 = function $$tapCardByCardsTextAndPlace(cardsText, place, isUntap) {
      var $a, $b, TMP_76, self = this, okCardList = nil, ngCardList = nil, cards = nil;

      okCardList = [];
      ngCardList = [];
      if ((($a = ((new RegExp("\\[(" + self.cardRegExp + "(," + self.cardRegExp + ")*)\\]"))['$=~'](cardsText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$split(/,/);
        ($a = ($b = cards).$each, $a.$$p = (TMP_76 = function(card){var self = TMP_76.$$s || this, $c, $d, okCard = nil, ngCard = nil;
if (card == null) card = nil;
        $d = self.$tapOneCardByCardAndPlace(card, place, isUntap), $c = Opal.to_ary($d), okCard = ($c[0] == null ? nil : $c[0]), ngCard = ($c[1] == null ? nil : $c[1]), $d;
          if ((($c = (okCard['$nil?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            okCardList['$<<'](okCard)
          };
          if ((($c = (ngCard['$nil?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return nil
            } else {
            return ngCardList['$<<'](ngCard)
          };}, TMP_76.$$s = self, TMP_76.$$arity = 1, TMP_76), $a).call($b);};
      return [okCardList, ngCardList];
    }, TMP_77.$$arity = 3);

    Opal.defn(self, '$tapOneCardByCardAndPlace', TMP_78 = function $$tapOneCardByCardAndPlace(card, place, isUntap) {
      var $a, self = this, result = nil, nick_e_original = nil, nick_to = nil, destination = nil;
      if ($gvars.okResult == null) $gvars.okResult = nil;

      card = card.$upcase();
      result = "";
      nick_e_original = self.nick_e;
      self.nick_e = self.nick_e.$upcase();
      nick_to = "";
      if ((($a = (isUntap)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        destination = "" + ($rb_minus($rb_times(place, 2), 1)) + (self.nick_e);
        nick_to = "" + ($rb_times(place, 2)) + (self.nick_e);
        } else {
        destination = "" + ($rb_times(place, 2)) + (self.nick_e);
        nick_to = "" + ($rb_minus($rb_times(place, 2), 1)) + (self.nick_e);
      };
      result = self.$transferOneCard(card, nick_to, destination);
      self.nick_e = nick_e_original;
      if ((($a = (result['$==']($gvars.okResult))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [card, nil]
        } else {
        return [nil, card]
      };
    }, TMP_78.$$arity = 3);

    Opal.defn(self, '$printMilStoneResult', TMP_79 = function $$printMilStoneResult(commandText) {
      var $a, $b, self = this, count = nil, output_msg = nil;

      $b = self.$getCardMilstone(commandText), $a = Opal.to_ary($b), count = ($a[0] == null ? nil : $a[0]), output_msg = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = ($rb_gt(count, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessage(self.channel, "" + (self.nick_e) + ": " + (self.$getCardsText(output_msg)) + "が出ました")
        } else {
        return self.$sendMessage(self.channel, "カードが残っていません")
      };
    }, TMP_79.$$arity = 1);

    Opal.defn(self, '$getCardMilstone', TMP_80 = function $$getCardMilstone(commandText) {
      var $a, $b, self = this, command = nil, count = nil, cards = nil, text = nil, cardInfo = nil, okCount = nil, ngCount = nil;

      command = "c-draw";
      count = 0;
      if ((($a = (/\[(\d+)\]/['$=~'](commandText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        count = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
        command = $rb_plus(command, "[" + (count) + "]");};
      cards = self.$drawCard(command);
      self.$debug("cards", cards);
      text = "";
      if ((($a = ($rb_gt(cards.$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cardInfo = self.$getCardsTextFromCards(cards);
        $b = self.$discardCards("c-discard[" + (cardInfo) + "]"), $a = Opal.to_ary($b), okCount = ($a[0] == null ? nil : $a[0]), ngCount = ($a[1] == null ? nil : $a[1]), text = ($a[2] == null ? nil : $a[2]), $b;
        self.$debug("discardCards okCount, ngCount, text", okCount, ngCount, text);
        count = okCount;
        } else {
        count = 0
      };
      self.$debug("count", count);
      self.$debug("cardInfo", cardInfo);
      return [count, cardInfo];
    }, TMP_80.$$arity = 1);

    Opal.defn(self, '$clearAllPlaceAllPlayerCards', TMP_82 = function $$clearAllPlaceAllPlayerCards() {
      var $a, $b, TMP_81, self = this;

      ($a = ($b = self.deal_cards).$each, $a.$$p = (TMP_81 = function(place, cards){var self = TMP_81.$$s || this;
if (place == null) place = nil;if (cards == null) cards = nil;
      return self.$clearAllPlayerCardsWhenPlayedPlace(place, cards)}, TMP_81.$$s = self, TMP_81.$$arity = 2, TMP_81), $a).call($b);
      return "場のカードを捨てました";
    }, TMP_82.$$arity = 0);

    Opal.defn(self, '$clearAllPlayerCardsWhenPlayedPlace', TMP_83 = function $$clearAllPlayerCardsWhenPlayedPlace(place, cards) {
      var $a, self = this;

      if ((($a = (place['$=~'](/^\d+/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$clearAllPlayerCards(place, cards)
        } else {
        return nil
      };
    }, TMP_83.$$arity = 2);

    Opal.defn(self, '$clearAllPlayerCards', TMP_84 = function $$clearAllPlayerCards(place, cards) {
      var $a, $b, $c, self = this, cardset = nil;

      cardset = cards.$join(",");
      self.$discardCards("c-discard[" + (cardset) + "]", place);
      ($a = place, $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      return self.deal_cards['$[]'](place).$clear();
    }, TMP_84.$$arity = 2);

    Opal.defn(self, '$returnCards', TMP_85 = function $$returnCards() {
      var $a, $b, $c, self = this, cards = nil;

      ($a = "card_played", $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      cards = self.deal_cards['$[]']("card_played");
      while ((($b = ($rb_gt(cards.$length(), 0))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      self.cardRest.$push(cards.$shift())};
      return "捨て札を山に戻しました";
    }, TMP_85.$$arity = 0);

    Opal.defn(self, '$getBurriedCard', TMP_86 = function $$getBurriedCard() {
      var $a, $b, $c, self = this, cards = nil;

      ($a = "card_played", $b = self.deal_cards, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      cards = self.deal_cards['$[]']("card_played");
      return cards.$length();
    }, TMP_86.$$arity = 0);

    Opal.defn(self, '$reviewCards', TMP_87 = function $$reviewCards() {
      var self = this;

      return self.cardRest.$join(",");
    }, TMP_87.$$arity = 0);

    Opal.defn(self, '$getAllCardLocation', TMP_89 = function $$getAllCardLocation() {
      var $a, $b, TMP_88, self = this, allText = nil, allPlaceText = nil;

      allText = "山札:" + (self.cardRest.$length()) + "枚 捨札:" + (self.$getBurriedCard()) + "枚";
      allPlaceText = "";
      ($a = ($b = self.deal_cards).$each, $a.$$p = (TMP_88 = function(place, cards){var self = TMP_88.$$s || this, $c, $d, text = nil, placeText = nil;
if (place == null) place = nil;if (cards == null) cards = nil;
      if ((($c = (place['$==']("card_played"))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return nil;};
        $d = self.$getCardLocationOnPlace(place, cards), $c = Opal.to_ary($d), text = ($c[0] == null ? nil : $c[0]), placeText = ($c[1] == null ? nil : $c[1]), $d;
        allText = $rb_plus(allText, text);
        return allPlaceText = $rb_plus(allPlaceText, placeText);}, TMP_88.$$s = self, TMP_88.$$arity = 2, TMP_88), $a).call($b);
      return [allText, allPlaceText];
    }, TMP_89.$$arity = 0);

    Opal.defn(self, '$getCardLocationOnPlace', TMP_90 = function $$getCardLocationOnPlace(place, cards) {
      var $a, self = this, text = nil, placeText = nil, placeNumber = nil, cnick = nil;
      if ($gvars.ircNickRegExp == null) $gvars.ircNickRegExp = nil;

      text = "";
      placeText = "";
      if ((($a = (place['$=~']((new RegExp("^(\\d+)(" + $gvars.ircNickRegExp + ")"))))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        placeNumber = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        cnick = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
        placeText = self.$getCardLocationOnNumberdPlace(cards, placeNumber, cnick);
        } else {
        text = " " + (place) + ":" + (cards.$length()) + "枚"
      };
      return [text, placeText];
    }, TMP_90.$$arity = 2);

    Opal.defn(self, '$getCardLocationOnNumberdPlace', TMP_91 = function $$getCardLocationOnNumberdPlace(cards, placeNumber, cnick) {
      var $a, self = this, cardText = nil;

      cardText = self.$getCardsText(cards);
      if ((($a = (self.$isTapCardPlace(placeNumber))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " " + (cnick) + "のタップした場札:" + (cardText)
        } else {
        return " " + (cnick) + "の場札:" + (cardText)
      };
    }, TMP_91.$$arity = 3);

    Opal.defn(self, '$getHandAndPlaceCardInfoText', TMP_92 = function $$getHandAndPlaceCardInfoText(str, destination) {
      var $a, self = this, hand = nil, place = nil;

      if (destination == null) {
        destination = nil;
      }
      self.$debug("getHandAndPlaceCardInfoText(str, destination)", str, destination);
      if ((($a = (destination['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        destination = self.nick_e};
      destination = destination.$upcase();
      hand = self.$getHandCardInfoText(destination);
      self.$debug("hand", hand);
      place = self.$getPlaceCardInfoText(destination);
      self.$debug("place", place);
      return $rb_plus(hand, place);
    }, TMP_92.$$arity = -2);

    Opal.defn(self, '$getHandCardInfoText', TMP_93 = function $$getHandCardInfoText(destination) {
      var $a, self = this, out_msg = nil;

      destination = destination.$upcase();
      self.$debug("getHandCardInfoText destination", destination);
      out_msg = self.$getDealCardsText(destination);
      if ((($a = (out_msg['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        out_msg = "カードを持っていません"};
      return out_msg;
    }, TMP_93.$$arity = 1);

    Opal.defn(self, '$getDealCardsText', TMP_94 = function $$getDealCardsText(destination) {
      var $a, self = this, cards = nil, cardsText = nil;

      self.$debug("getDealCardsText destination", destination);
      cards = self.deal_cards['$[]'](destination);
      self.$debug("@deal_cards", self.deal_cards);
      self.$debug("getDealCardsText cards", cards);
      if ((($a = (cards['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      cardsText = self.$getCardsTextFromCards(cards);
      return "[ " + (cardsText) + " ]";
    }, TMP_94.$$arity = 1);

    Opal.defn(self, '$compareCard', TMP_95 = function $$compareCard(a, b) {
      var $a, self = this;

      if ((($a = (a['$=~'](/[^\d]/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$compareCardByCardNumber(a, b)
        } else {
        return a['$<=>'](b)
      };
    }, TMP_95.$$arity = 2);

    Opal.defn(self, '$compareCardByCardNumber', TMP_96 = function $$compareCardByCardNumber(a, b) {
      var $a, self = this, a1 = nil, a2 = nil, b1 = nil, b2 = nil, result = nil;

      /([^\d]+)(\d+)/['$=~'](a);
      a1 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      a2 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      /([^\d]+)(\d+)/['$=~'](b);
      b1 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      b2 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      result = [a1, a2]['$<=>']([b1, b2]);
      return result;
    }, TMP_96.$$arity = 2);

    Opal.defn(self, '$getPlaceCardInfoText', TMP_98 = function $$getPlaceCardInfoText(destination) {
      var $a, $b, TMP_97, self = this, out_msg = nil, place_max = nil;

      destination = destination.$upcase();
      out_msg = "";
      if ((($a = ($rb_gt(self.card_place, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return out_msg
      };
      place_max = self.card_place;
      if ((($a = (self.canTapCard)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        place_max = $rb_times(place_max, 2)};
      self.$debug("place_max", place_max);
      ($a = ($b = place_max).$times, $a.$$p = (TMP_97 = function(i){var self = TMP_97.$$s || this, $c, index = nil, dealCardsKey = nil, cards = nil, cardsText = nil;
        if (self.deal_cards == null) self.deal_cards = nil;
if (i == null) i = nil;
      index = $rb_plus(i, 1);
        dealCardsKey = "" + (index) + (destination);
        self.$debug("dealCardsKey", dealCardsKey);
        cards = self.deal_cards['$[]'](dealCardsKey);
        ((($c = cards) !== false && $c !== nil && $c != null) ? $c : cards = []);
        cardsText = self.$getCardsTextFromCards(cards);
        if ((($c = (self.$isTapCardPlace(index))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return out_msg = $rb_plus(out_msg, " タップした場札:[ " + (cardsText) + " ]")
          } else {
          return out_msg = $rb_plus(out_msg, " 場札:[ " + (cardsText) + " ]")
        };}, TMP_97.$$s = self, TMP_97.$$arity = 1, TMP_97), $a).call($b);
      return out_msg;
    }, TMP_98.$$arity = 1);

    Opal.defn(self, '$getCardsText', TMP_99 = function $$getCardsText(cardsText) {
      var self = this, cards = nil;

      cards = cardsText.$split(/,/);
      return self.$getCardsTextFromCards(cards);
    }, TMP_99.$$arity = 1);

    Opal.defn(self, '$getCardsTextFromCards', TMP_102 = function $$getCardsTextFromCards(cards) {
      var $a, $b, TMP_100, $c, TMP_101, self = this, out_msg = nil;
      if ($gvars.isHandSort == null) $gvars.isHandSort = nil;

      if ((($a = ($gvars.isHandSort)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        cards = ($a = ($b = cards).$sort, $a.$$p = (TMP_100 = function(a, b){var self = TMP_100.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
        return self.$compareCard(a, b)}, TMP_100.$$s = self, TMP_100.$$arity = 2, TMP_100), $a).call($b)};
      if ((($a = (self.cardTitles['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return cards.$join(",")};
      out_msg = "";
      ($a = ($c = cards).$each, $a.$$p = (TMP_101 = function(cardNumber){var self = TMP_101.$$s || this, $d, title = nil;
        if (self.cardTitles == null) self.cardTitles = nil;
if (cardNumber == null) cardNumber = nil;
      if ((($d = (out_msg['$!='](""))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          out_msg = $rb_plus(out_msg, ",")};
        title = self.cardTitles['$[]'](cardNumber);
        return out_msg = $rb_plus(out_msg, "" + (cardNumber) + "-" + (title));}, TMP_101.$$s = self, TMP_101.$$arity = 1, TMP_101), $a).call($c);
      if ((($a = (out_msg['$=='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        out_msg = "無し"};
      return out_msg;
    }, TMP_102.$$arity = 1);

    Opal.defn(self, '$isTapCardPlace', TMP_103 = function $$isTapCardPlace(index) {
      var $a, self = this;

      if ((($a = (self.canTapCard)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ((index['$%'](2))['$=='](0));
    }, TMP_103.$$arity = 1);

    Opal.defn(self, '$printCardRestorationSpellResult', TMP_104 = function $$printCardRestorationSpellResult(spellText) {
      var $a, self = this, output_msg = nil;

      output_msg = self.$throwCardRestorationSpell(spellText);
      if ((($a = (output_msg['$==']("readSpell"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessage(self.channel, "" + (self.nick_e) + ": カード配置を復活しました")
        } else {
        return self.$sendMessage(self.channel, output_msg)
      };
    }, TMP_104.$$arity = 1);

    Opal.defn(self, '$throwCardRestorationSpell', TMP_105 = function $$throwCardRestorationSpell(spellText) {
      var $a, self = this, output = nil;

      output = "0";
      self.$debug("spellText", spellText);
      if ((($a = (spellText['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("getNewSpellText");
        spellText = self.$getNewSpellText();
        output = "復活の呪文 ＞ [" + (spellText) + "]";
        } else {
        self.$debug("setNewSpellText");
        output = self.$setNewSpellText(spellText);
      };
      self.$debug("throwCardRestorationSpell output", output);
      return output;
    }, TMP_105.$$arity = 1);

    Opal.defn(self, '$getNewSpellText', TMP_106 = function $$getNewSpellText() {
      var self = this, textList = nil, placeNames = nil, spellWords = nil;

      self.$debug("getNewSpellText begin");
      textList = [];
      placeNames = self.deal_cards.$keys().$sort();
      textList['$<<'](placeNames);
      spellWords = self.$getSpellWords();
      textList['$<<'](spellWords);
      return textList.$join(",");
    }, TMP_106.$$arity = 0);

    Opal.defn(self, '$getSpellWords', TMP_108 = function $$getSpellWords() {
      var $a, $b, TMP_107, self = this, spellWords = nil;

      spellWords = "";
      ($a = ($b = self.card_val).$each, $a.$$p = (TMP_107 = function(card){var self = TMP_107.$$s || this, index = nil, indexWord = nil;
if (card == null) card = nil;
      index = self.$getDealCardIndex(card);
        indexWord = self.$getIndexWord(index);
        return spellWords['$<<'](indexWord);}, TMP_107.$$s = self, TMP_107.$$arity = 1, TMP_107), $a).call($b);
      spellWords = self.$shrinkSpellWords(spellWords);
      return spellWords;
    }, TMP_108.$$arity = 0);

    Opal.defn(self, '$getIndexWord', TMP_109 = function $$getIndexWord(index) {
      var self = this;

      return self.card_spell['$[]']($rb_plus(index, 1));
    }, TMP_109.$$arity = 1);

    Opal.defn(self, '$getDealCardIndex', TMP_111 = function $$getDealCardIndex(card) {try {

      var $a, $b, TMP_110, self = this;

      ($a = ($b = self.deal_cards.$keys().$sort()).$each_with_index, $a.$$p = (TMP_110 = function(place, index){var self = TMP_110.$$s || this, $c, cards = nil;
        if (self.deal_cards == null) self.deal_cards = nil;
if (place == null) place = nil;if (index == null) index = nil;
      cards = self.deal_cards['$[]'](place);
        if ((($c = (cards['$include?'](card))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          Opal.ret(index)
          } else {
          return nil
        };}, TMP_110.$$s = self, TMP_110.$$arity = 2, TMP_110), $a).call($b);
      return -1;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_111.$$arity = 1);

    Opal.defn(self, '$shrinkSpellWords', TMP_114 = function $$shrinkSpellWords(spellWords) {
      var $a, $b, TMP_112, self = this;

      ($a = ($b = self.card_spell).$each, $a.$$p = (TMP_112 = function(word){var self = TMP_112.$$s || this, $c, $d, TMP_113;
if (word == null) word = nil;
      return spellWords = ($c = ($d = spellWords).$gsub, $c.$$p = (TMP_113 = function(){var self = TMP_113.$$s || this, $e;

        return $rb_plus(word, ($rb_plus((($e = $gvars['~']) === nil ? nil : $e['$[]'](1)).$length(), 1)).$to_s())}, TMP_113.$$s = self, TMP_113.$$arity = 0, TMP_113), $c).call($d, (new RegExp("" + word + "(" + word + "+)")))}, TMP_112.$$s = self, TMP_112.$$arity = 1, TMP_112), $a).call($b);
      return spellWords;
    }, TMP_114.$$arity = 1);

    Opal.defn(self, '$setNewSpellText', TMP_116 = function $$setNewSpellText(spellText) {
      var $a, $b, TMP_115, self = this, textList = nil, spellWords = nil, placeNames = nil;

      self.$shuffleCards();
      textList = spellText.$split(",");
      spellWords = textList.$pop();
      placeNames = textList;
      self.$debug("placeNames", placeNames);
      self.$debug("spellWords", spellWords);
      spellWords = self.$expandSpellWords(spellWords);
      self.$debug("expanded spellWords", spellWords);
      ($a = ($b = placeNames).$each_with_index, $a.$$p = (TMP_115 = function(place, index){var self = TMP_115.$$s || this, indexWord = nil, cards = nil;
        if (self.deal_cards == null) self.deal_cards = nil;
if (place == null) place = nil;if (index == null) index = nil;
      indexWord = self.$getIndexWord(index);
        cards = self.$getCardsFromIndexWordAndSpellText(indexWord, spellWords);
        return self.deal_cards['$[]='](place, cards);}, TMP_115.$$s = self, TMP_115.$$arity = 2, TMP_115), $a).call($b);
      self.$debug("setNewSpellText @deal_cards", self.deal_cards);
      return "readSpell";
    }, TMP_116.$$arity = 1);

    Opal.defn(self, '$expandSpellWords', TMP_119 = function $$expandSpellWords(spellWords) {
      var $a, $b, TMP_117, self = this;

      ($a = ($b = self.card_spell).$each, $a.$$p = (TMP_117 = function(word){var self = TMP_117.$$s || this, $c, $d, TMP_118;
if (word == null) word = nil;
      return spellWords = ($c = ($d = spellWords).$gsub, $c.$$p = (TMP_118 = function(){var self = TMP_118.$$s || this, $e;

        return $rb_times(word, (($e = $gvars['~']) === nil ? nil : $e['$[]'](1)).$to_i())}, TMP_118.$$s = self, TMP_118.$$arity = 0, TMP_118), $c).call($d, (new RegExp("" + word + "(\\d+)")))}, TMP_117.$$s = self, TMP_117.$$arity = 1, TMP_117), $a).call($b);
      return spellWords;
    }, TMP_119.$$arity = 1);

    return (Opal.defn(self, '$getCardsFromIndexWordAndSpellText', TMP_122 = function $$getCardsFromIndexWordAndSpellText(indexWord, spellText) {
      var $a, $b, TMP_120, self = this, cards = nil;

      cards = [];
      ($a = ($b = spellText.$split(/(?:)/)).$each_with_index, $a.$$p = (TMP_120 = function(word, index){var self = TMP_120.$$s || this, $c, $d, TMP_121, card = nil, isDelete = nil;
        if (self.card_val == null) self.card_val = nil;
        if (self.cardRest == null) self.cardRest = nil;
if (word == null) word = nil;if (index == null) index = nil;
      if ((($c = (indexWord['$=='](word))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        card = self.card_val['$[]'](index);
        isDelete = ($c = ($d = self.cardRest).$delete_if, $c.$$p = (TMP_121 = function(i){var self = TMP_121.$$s || this;
if (i == null) i = nil;
        return i['$=='](card)}, TMP_121.$$s = self, TMP_121.$$arity = 1, TMP_121), $c).call($d);
        if ((($c = (isDelete)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        return cards['$<<'](card);}, TMP_120.$$s = self, TMP_120.$$arity = 2, TMP_120), $a).call($b);
      return cards;
    }, TMP_122.$$arity = 2), nil) && 'getCardsFromIndexWordAndSpellText';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
Opal.modules["fileutils"] = function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  return nil
};

/* Generated by Opal 0.10.5 */
Opal.modules["TableFileData"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$new', '$searchTableFileDefine', '$[]=', '$include?', '$<<', '$merge!', '$nil?', '$!', '$exist?', '$directory?', '$glob', '$each', '$untaint', '$readGameCommandInfo', '$[]', '$empty?', '$basename', '$===', '$+', '$readOneTableData', '$=~', '$split', '$shift', '$getDiceAndTitle', '$getLineKeyValue', '$to_i', '$class', '$isTargetGameType', '$keys', '$changeEnterCode', '$gsub', '$==', '$getTableDataFromFile', '$getTableFileName', '$checkFile', '$getTableText', '$createFile', '$checkFileNotExist', '$raise', '$initCommand', '$checkCommand', '$kind_of?', '$getFormatedTableText', '$each_with_index', '$tr!', '$checkTableKey', '$toutf8', '$open', '$write', '$checkFileWhenFileNameNotChanged', '$checkFileWhenFileNameChanged', '$checkFileExist', '$mv']);
  self.$require("kconv");
  self.$require("fileutils");
  self.$require("configBcDice.rb");
  (function($base, $super) {
    function $TableFileData(){};
    var self = $TableFileData = $klass($base, $super, 'TableFileData', $TableFileData);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_5, TMP_6, TMP_8, TMP_10, TMP_12, TMP_13, TMP_14, TMP_15, TMP_17, TMP_19, TMP_20, TMP_21;

    def.dir = def.dirs = def.tableData = nil;
    (Opal.cvars['@@virtualTableData'] = $scope.get('Hash').$new());

    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(isLoadCommonTable) {
      var $a, self = this;

      if (isLoadCommonTable == null) {
        isLoadCommonTable = true;
      }
      self.dirs = [];
      self.tableData = $scope.get('Hash').$new();
      if ((($a = (isLoadCommonTable)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      self.dir = "./";
      self.tableData = self.$searchTableFileDefine(self.dir);
      return self.tableData = (($a = Opal.cvars['@@virtualTableData']) == null ? nil : $a);
    }, TMP_1.$$arity = -1);

    Opal.defs(self, '$setVirtualTableData', TMP_2 = function $$setVirtualTableData(hash, gameType, command, lines) {
      var $a, self = this;

      return (($a = Opal.cvars['@@virtualTableData']) == null ? nil : $a)['$[]='](hash, $hash2(["fileName", "gameType", "command", "lines"], {"fileName": "" + (hash) + ".txt", "gameType": gameType, "command": command, "lines": lines}));
    }, TMP_2.$$arity = 4);

    Opal.defn(self, '$setDir', TMP_3 = function $$setDir(dir, prefix) {
      var $a, self = this, tableData = nil;

      if (prefix == null) {
        prefix = "";
      }
      if ((($a = (self.dirs['$include?'](dir))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.dirs['$<<'](dir);
      tableData = self.$searchTableFileDefine(dir, prefix);
      return self.tableData['$merge!'](tableData);
    }, TMP_3.$$arity = -2);

    Opal.defn(self, '$searchTableFileDefine', TMP_5 = function $$searchTableFileDefine(dir, prefix) {
      var $a, $b, TMP_4, self = this, tableData = nil, fileNames = nil;

      if (prefix == null) {
        prefix = "";
      }
      tableData = $scope.get('Hash').$new();
      if ((($a = (dir['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return tableData};
      if ((($a = ($scope.get('File')['$exist?'](dir)['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return tableData};
      if ((($a = ($scope.get('File')['$directory?'](dir)['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return tableData};
      fileNames = $scope.get('Dir').$glob("" + (dir) + "/" + (prefix) + "*.txt");
      ($a = ($b = fileNames).$each, $a.$$p = (TMP_4 = function(fileName){var self = TMP_4.$$s || this, $c, info = nil, gameType = nil, command = nil;
if (fileName == null) fileName = nil;
      fileName = fileName.$untaint();
        info = self.$readGameCommandInfo(fileName, prefix);
        gameType = info['$[]']("gameType");
        ((($c = gameType) !== false && $c !== nil && $c != null) ? $c : gameType = "");
        command = info['$[]']("command");
        if ((($c = (command['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return nil;};
        return tableData['$[]=']("" + (gameType) + "_" + (command), info);}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4), $a).call($b);
      return tableData;
    }, TMP_5.$$arity = -2);

    Opal.defn(self, '$readGameCommandInfo', TMP_6 = function $$readGameCommandInfo(fileName, prefix) {
      var $a, self = this, info = nil, baseName = nil, $case = nil;

      info = $hash2(["fileName", "gameType", "command"], {"fileName": fileName, "gameType": "", "command": ""});
      baseName = $scope.get('File').$basename(fileName, ".txt");
      $case = baseName;if ((new RegExp("^" + prefix + "(.+)_(.+)_(.+)$"))['$===']($case)) {info['$[]=']("command", (($a = $gvars['~']) === nil ? nil : $a['$[]'](3)));
      info['$[]=']("gameType", $rb_plus($rb_plus((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)), ":"), (($a = $gvars['~']) === nil ? nil : $a['$[]'](2))));}else if ((new RegExp("^" + prefix + "(.+)_(.+)$"))['$===']($case)) {info['$[]=']("command", (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)));
      info['$[]=']("gameType", (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)));}else if ((new RegExp("^" + prefix + "(.+)$"))['$===']($case)) {info['$[]=']("command", (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)));
      info['$[]=']("gameType", "");};
      return info;
    }, TMP_6.$$arity = 2);

    Opal.defn(self, '$getAllTableInfo', TMP_8 = function $$getAllTableInfo() {
      var $a, $b, TMP_7, self = this, result = nil;

      result = [];
      ($a = ($b = self.tableData).$each, $a.$$p = (TMP_7 = function(key, oneTableData){var self = TMP_7.$$s || this, tableData = nil;
if (key == null) key = nil;if (oneTableData == null) oneTableData = nil;
      tableData = self.$readOneTableData(oneTableData);
        return result['$<<'](tableData);}, TMP_7.$$s = self, TMP_7.$$arity = 2, TMP_7), $a).call($b);
      return result;
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$getGameCommandInfos', TMP_10 = function $$getGameCommandInfos() {
      var $a, $b, TMP_9, self = this, commandInfos = nil;

      commandInfos = [];
      ($a = ($b = self.tableData).$each, $a.$$p = (TMP_9 = function(command, info){var self = TMP_9.$$s || this, commandInfo = nil;
if (command == null) command = nil;if (info == null) info = nil;
      commandInfo = $hash2(["gameType", "command"], {"gameType": info['$[]']("gameType"), "command": info['$[]']("command")});
        return commandInfos['$<<'](commandInfo);}, TMP_9.$$s = self, TMP_9.$$arity = 2, TMP_9), $a).call($b);
      return commandInfos;
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$getTableDataFromFile', TMP_12 = function $$getTableDataFromFile(fileName) {
      var $a, $b, TMP_11, self = this, table = nil, lines = nil, data = nil, defineLine = nil, dice = nil, title = nil;

      table = [];
      lines = [];
      if ((($a = (/(.+)\.txt$/['$=~'](fileName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        data = self.tableData['$[]']((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)));
        if ((($a = (data['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          lines = data['$[]']("lines").$split("\n")
        };};
      defineLine = lines.$shift();
      $b = self.$getDiceAndTitle(defineLine), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), title = ($a[1] == null ? nil : $a[1]), $b;
      ($a = ($b = lines).$each, $a.$$p = (TMP_11 = function(line){var self = TMP_11.$$s || this, $c, $d, key = nil, value = nil;
if (line == null) line = nil;
      $d = self.$getLineKeyValue(line), $c = Opal.to_ary($d), key = ($c[0] == null ? nil : $c[0]), value = ($c[1] == null ? nil : $c[1]), $d;
        if ((($c = (key['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return nil;};
        key = key.$to_i();
        return table['$<<']([key, value]);}, TMP_11.$$s = self, TMP_11.$$arity = 1, TMP_11), $a).call($b);
      return [dice, title, table];
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$getLineKeyValue', TMP_13 = function $$getLineKeyValue(line) {
      var self = this;

      return self.$class().$getLineKeyValue(line);
    }, TMP_13.$$arity = 1);

    Opal.defs(self, '$getLineKeyValue', TMP_14 = function $$getLineKeyValue(line) {
      var $a, self = this, key = nil, value = nil;

      if ((($a = (/^[\s　]*([^:：]+)[\s　]*[:：][\s　]*(.+)/['$==='](line))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return ["", ""]
      };
      key = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      value = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      return [key, value];
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$getDiceAndTitle', TMP_15 = function $$getDiceAndTitle(line) {
      var $a, $b, self = this, dice = nil, title = nil;

      $b = self.$getLineKeyValue(line), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), title = ($a[1] == null ? nil : $a[1]), $b;
      return [dice, title];
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$getTableData', TMP_17 = function $$getTableData(arg, targetGameType) {
      var $a, $b, TMP_16, self = this, oneTableData = nil, isSecret = nil, dice = nil, title = nil, table = nil;

      oneTableData = $scope.get('Hash').$new();
      isSecret = false;
      (function(){var $brk = Opal.new_brk(); try {return ($a = ($b = self.tableData.$keys()).$each, $a.$$p = (TMP_16 = function(fileName){var self = TMP_16.$$s || this, $c, key = nil, pattern = nil, reg1 = nil, data = nil, gameType = nil;
        if (self.tableData == null) self.tableData = nil;
if (fileName == null) fileName = nil;
      if ((($c = (/.*_(.+)/['$==='](fileName))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        key = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1));
        pattern = "^(s|S)?" + (key) + "(\\s|$)";
        if ((($c = ($scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')))['$==='](arg))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        reg1 = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1));
        data = self.tableData['$[]'](fileName);
        gameType = data['$[]']("gameType");
        if ((($c = (self.$isTargetGameType(gameType, targetGameType))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          } else {
          return nil;
        };
        oneTableData = data;
        isSecret = (reg1['$nil?']()['$!']());
        
        Opal.brk(nil, $brk);}, TMP_16.$$s = self, TMP_16.$$brk = $brk, TMP_16.$$arity = 1, TMP_16), $a).call($b)
      } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
      self.$readOneTableData(oneTableData);
      dice = oneTableData['$[]']("dice");
      title = oneTableData['$[]']("title");
      table = oneTableData['$[]']("table");
      table = self.$changeEnterCode(table);
      return [dice, title, table, isSecret];
    }, TMP_17.$$arity = 2);

    Opal.defn(self, '$changeEnterCode', TMP_19 = function $$changeEnterCode(table) {
      var $a, $b, TMP_18, self = this, newTable = nil;

      newTable = $hash2([], {});
      if ((($a = (table['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return newTable};
      ($a = ($b = table).$each, $a.$$p = (TMP_18 = function(key, value){var self = TMP_18.$$s || this;
if (key == null) key = nil;if (value == null) value = nil;
      value = value.$gsub(/\\n/, "\n");
        value = value.$gsub(/\\\n/, "\\n");
        return newTable['$[]='](key, value);}, TMP_18.$$s = self, TMP_18.$$arity = 2, TMP_18), $a).call($b);
      return newTable;
    }, TMP_19.$$arity = 1);

    Opal.defn(self, '$isTargetGameType', TMP_20 = function $$isTargetGameType(gameType, targetGameType) {
      var $a, self = this;

      if ((($a = (gameType['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      return (gameType['$=='](targetGameType));
    }, TMP_20.$$arity = 2);

    return (Opal.defn(self, '$readOneTableData', TMP_21 = function $$readOneTableData(oneTableData) {
      var $a, $b, self = this, command = nil, gameType = nil, fileName = nil, dice = nil, title = nil, table = nil;

      if ((($a = (oneTableData['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (oneTableData['$[]']("table")['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      command = oneTableData['$[]']("command");
      gameType = oneTableData['$[]']("gameType");
      fileName = oneTableData['$[]']("fileName");
      if ((($a = (command['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      $b = self.$getTableDataFromFile(fileName), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), title = ($a[1] == null ? nil : $a[1]), table = ($a[2] == null ? nil : $a[2]), $b;
      oneTableData['$[]=']("dice", dice);
      oneTableData['$[]=']("title", title);
      oneTableData['$[]=']("table", table);
      return oneTableData;
    }, TMP_21.$$arity = 1), nil) && 'readOneTableData';
  })($scope.base, null);
  (function($base, $super) {
    function $TableFileCreator(){};
    var self = $TableFileCreator = $klass($base, $super, 'TableFileCreator', $TableFileCreator);

    var def = self.$$proto, $scope = self.$$scope, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_32, TMP_33, TMP_35;

    def.params = def.command = def.dir = def.prefix = nil;
    Opal.defn(self, '$initialize', TMP_22 = function $$initialize(dir, prefix, params) {
      var self = this;

      self.dir = dir;
      self.prefix = prefix;
      return self.params = params;
    }, TMP_22.$$arity = 3);

    Opal.defn(self, '$execute', TMP_23 = function $$execute() {
      var self = this, fileName = nil, text = nil;

      fileName = self.$getTableFileName();
      self.$checkFile(fileName);
      text = self.$getTableText();
      return self.$createFile(fileName, text);
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$checkFile', TMP_24 = function $$checkFile(fileName) {
      var self = this;

      return self.$checkFileNotExist(fileName);
    }, TMP_24.$$arity = 1);

    Opal.defn(self, '$checkFileNotExist', TMP_25 = function $$checkFileNotExist(fileName) {
      var $a, self = this;

      if ((($a = ($scope.get('File')['$exist?'](fileName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise("commandNameAlreadyExist")
        } else {
        return nil
      };
    }, TMP_25.$$arity = 1);

    Opal.defn(self, '$checkFileExist', TMP_26 = function $$checkFileExist(fileName) {
      var $a, self = this;

      if ((($a = ($scope.get('File')['$exist?'](fileName))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self.$raise("commandNameIsNotExist")
      };
    }, TMP_26.$$arity = 1);

    Opal.defn(self, '$getTableFileName', TMP_27 = function $$getTableFileName(command, gameType) {
      var $a, self = this, prefix2 = nil, fileName = nil;

      if (command == null) {
        command = nil;
      }
      if (gameType == null) {
        gameType = nil;
      }
      if ((($a = (gameType['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        gameType = self.params['$[]']("gameType")};
      ((($a = gameType) !== false && $a !== nil && $a != null) ? $a : gameType = "");
      gameType = gameType.$gsub(":", "_");
      if ((($a = (command['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$initCommand();
        command = self.command;};
      self.$checkCommand(command);
      prefix2 = "";
      if ((($a = (gameType['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        prefix2 = "" + (gameType) + "_"
      };
      fileName = "" + (self.dir) + "/" + (self.prefix) + (prefix2) + (command) + ".txt";
      fileName.$untaint();
      return fileName;
    }, TMP_27.$$arity = -1);

    Opal.defn(self, '$initCommand', TMP_28 = function $$initCommand() {
      var $a, self = this;

      self.command = self.params['$[]']("command");
      ((($a = self.command) !== false && $a !== nil && $a != null) ? $a : self.command = "");
      self.command = self.command.$gsub(/\./, "_");
      return self.command.$untaint();
    }, TMP_28.$$arity = 0);

    Opal.defn(self, '$checkCommand', TMP_29 = function $$checkCommand(command) {
      var $a, self = this;

      if ((($a = (command['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise("commandNameIsEmpty")};
      if ((($a = (/^[a-zA-Z\d]+$/['$==='](command))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self.$raise("commandNameCanUseOnlyAlphabetAndNumber")
      };
    }, TMP_29.$$arity = 1);

    Opal.defn(self, '$getTableText', TMP_30 = function $$getTableText() {
      var $a, self = this, dice = nil, title = nil, table = nil, text = nil;

      dice = self.params['$[]']("dice");
      title = self.params['$[]']("title");
      table = self.params['$[]']("table");
      text = "";
      text = $rb_plus(text, "" + (dice) + ":" + (title) + "\n");
      if ((($a = (table['$kind_of?']($scope.get('String'))['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        table = self.$getFormatedTableText(table)};
      return text = $rb_plus(text, table);
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$getFormatedTableText', TMP_32 = function $$getFormatedTableText(table) {
      var $a, $b, TMP_31, self = this, result = nil;

      result = "";
      ($a = ($b = table).$each_with_index, $a.$$p = (TMP_31 = function(line, index){var self = TMP_31.$$s || this, $c, $d, key = nil, value = nil;
if (line == null) line = nil;if (index == null) index = nil;
      $d = $scope.get('TableFileData').$getLineKeyValue(line), $c = Opal.to_ary($d), key = ($c[0] == null ? nil : $c[0]), value = ($c[1] == null ? nil : $c[1]), $d;
        key['$tr!']("　", "");
        key['$tr!'](" ", "");
        key['$tr!']("０-９", "0-9");
        key = self.$checkTableKey(key, index);
        return result = $rb_plus(result, ((((("") + (key)) + ":") + (value)) + "\n").$toutf8());}, TMP_31.$$s = self, TMP_31.$$arity = 2, TMP_31), $a).call($b);
      return result;
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$checkTableKey', TMP_33 = function $$checkTableKey(key, index) {
      var $a, self = this, keyValue = nil;

      if ((($a = (key['$==']("0"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      keyValue = key.$to_i();
      if ((($a = (keyValue['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise("tableFormatIsInvalid\t" + ($rb_plus(index, 1)) + "\t" + (key))};
      return keyValue;
    }, TMP_33.$$arity = 2);

    return (Opal.defn(self, '$createFile', TMP_35 = function $$createFile(fileName, text) {
      var $a, $b, TMP_34, self = this;

      return ($a = ($b = self).$open, $a.$$p = (TMP_34 = function(file){var self = TMP_34.$$s || this;
if (file == null) file = nil;
      return file.$write(text)}, TMP_34.$$s = self, TMP_34.$$arity = 1, TMP_34), $a).call($b, fileName, "w+");
    }, TMP_35.$$arity = 2), nil) && 'createFile';
  })($scope.base, null);
  return (function($base, $super) {
    function $TableFileEditer(){};
    var self = $TableFileEditer = $klass($base, $super, 'TableFileEditer', $TableFileEditer);

    var def = self.$$proto, $scope = self.$$scope, TMP_36, TMP_37, TMP_38;

    def.params = def.originalCommand = def.command = def.originalGameType = def.gameType = nil;
    Opal.defn(self, '$checkFile', TMP_36 = function $$checkFile(fileName) {
      var $a, $b, self = this;

      self.originalCommand = self.params['$[]']("originalCommand");
      self.gameType = self.params['$[]']("gameType");
      self.originalGameType = self.params['$[]']("originalGameType");
      if ((($a = (($b = (self.originalCommand['$=='](self.command)), $b !== false && $b !== nil && $b != null ?(self.originalGameType['$=='](self.gameType)) : $b))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$checkFileWhenFileNameNotChanged(fileName)
        } else {
        return self.$checkFileWhenFileNameChanged(fileName)
      };
    }, TMP_36.$$arity = 1);

    Opal.defn(self, '$checkFileWhenFileNameNotChanged', TMP_37 = function $$checkFileWhenFileNameNotChanged(fileName) {
      var self = this;

      return self.$checkFileExist(fileName);
    }, TMP_37.$$arity = 1);

    return (Opal.defn(self, '$checkFileWhenFileNameChanged', TMP_38 = function $$checkFileWhenFileNameChanged(fileName) {
      var $a, self = this, originalCommand = nil, originalGameType = nil, originalFileName = nil, e = nil;

      originalCommand = self.originalCommand;
      ((($a = originalCommand) !== false && $a !== nil && $a != null) ? $a : originalCommand = self.command);
      originalGameType = self.originalGameType;
      ((($a = originalGameType) !== false && $a !== nil && $a != null) ? $a : originalGameType = self.gameType);
      originalFileName = self.$getTableFileName(originalCommand, originalGameType);
      self.$checkFileExist(originalFileName);
      self.$checkFileNotExist(fileName);
      try {
        return $scope.get('FileUtils').$mv(originalFileName, fileName)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            return self.$raise("changeCommandNameFaild")
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_38.$$arity = 1), nil) && 'checkFileWhenFileNameChanged';
  })($scope.base, $scope.get('TableFileCreator'));
};

/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars, $hash2 = Opal.hash2;

  Opal.add_stubs(['$freeze', '$map', '$to_proc', '$join', '$new', '$clearPrefixes', '$!', '$empty?', '$prefixs', '$prefixes', '$class', '$puts', '$gameType', '$setPrefixes', '$attr_accessor', '$attr_reader', '$gameName', '$getHelpMessage', '$rand', '$check_suc', '$roll', '$marshalSignOfInequality', '$unlimitedRollDiceType', '$getD66Value', '$rollDiceAddingUp', '$parren_killer', '$debug', '$isGetOriginalMessage', '$getOriginalMessage', '$=~', '$prefixesPattern', '$removeDiceCommandMessage', '$rollDiceCommandCatched', '$nil?', '$!=', '$sub', '$rollDiceCommand', '$to_s', '$get_table_by_nD6', '$get_table_by_nDx', '$getTableValue', '$[]', '$-', '$/', '$getD66', '$bcdice', '$get_table_by_number', '$+', '$*', '$getDiceListFromDiceText', '$collect', '$to_i', '$split', '$each', '$>=', '$kind_of?', '$call', '$select', '$===', '$public_methods', '$send']);
  return (function($base, $super) {
    function $DiceBot(){};
    var self = $DiceBot = $klass($base, $super, 'DiceBot', $DiceBot);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_40, TMP_41, TMP_42, TMP_43, TMP_44, TMP_45, TMP_46, TMP_47, TMP_48, TMP_49, TMP_50, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_61, TMP_63, TMP_64, TMP_67;

    def.gameType = def.sortType = def.diceText = nil;
    Opal.cdecl($scope, 'EMPTY_PREFIXES_PATTERN', (/(^|\s)(S)?()(\s|$)/i).$freeze());

    Opal.defs(self, '$prefixes', TMP_1 = function $$prefixes() {
      var self = this;
      if (self.prefixes == null) self.prefixes = nil;

      return self.prefixes;
    }, TMP_1.$$arity = 0);

    Opal.defs(self, '$prefixesPattern', TMP_2 = function $$prefixesPattern() {
      var self = this;
      if (self.prefixesPattern == null) self.prefixesPattern = nil;

      return self.prefixesPattern;
    }, TMP_2.$$arity = 0);

    Opal.defs(self, '$setPrefixes', TMP_3 = function $$setPrefixes(prefixes) {
      var $a, $b, self = this, pattern = nil;

      self.prefixes = ($a = ($b = prefixes).$map, $a.$$p = "freeze".$to_proc(), $a).call($b).$freeze();
      pattern = "(^|\\s)(S)?(" + (prefixes.$join("|")) + ")(\\s|$)";
      self.prefixesPattern = $scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE'))).$freeze();
      return self;
    }, TMP_3.$$arity = 1);

    Opal.defs(self, '$clearPrefixes', TMP_4 = function $$clearPrefixes() {
      var self = this;

      self.prefixes = [].$freeze();
      self.prefixesPattern = $scope.get('EMPTY_PREFIXES_PATTERN');
      return self;
    }, TMP_4.$$arity = 0);

    Opal.defs(self, '$inherited', TMP_5 = function $$inherited(subclass) {
      var self = this;

      return subclass.$clearPrefixes();
    }, TMP_5.$$arity = 1);

    self.$clearPrefixes();

    (Opal.cvars['@@bcdice'] = nil);

    (Opal.cvars['@@DEFAULT_SEND_MODE'] = 2);

    Opal.defn(self, '$initialize', TMP_6 = function $$initialize() {
      var $a, $b, self = this;
      if ($gvars.stderr == null) $gvars.stderr = nil;

      self.sendMode = (($a = Opal.cvars['@@DEFAULT_SEND_MODE']) == null ? nil : $a);
      self.sortType = 0;
      self.sameDiceRerollCount = 0;
      self.sameDiceRerollType = 0;
      self.d66Type = 1;
      self.isPrintMaxDice = false;
      self.upplerRollThreshold = 0;
      self.unlimitedRollDiceType = 0;
      self.rerollNumber = 0;
      self.defaultSuccessTarget = "";
      self.rerollLimitCount = 10000;
      self.fractionType = "omit";
      self.gameType = "DiceBot";
      if ((($a = ($b = self.$prefixs()['$empty?']()['$!'](), $b !== false && $b !== nil && $b != null ?self.$class().$prefixes()['$empty?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $gvars.stderr.$puts("" + (self.$gameType()) + ": #prefixs is deprecated. Please use .setPrefixes.");
        return self.$class().$setPrefixes(self.$prefixs());
        } else {
        return nil
      };
    }, TMP_6.$$arity = 0);

    self.$attr_accessor("rerollLimitCount");

    self.$attr_reader("sendMode", "sameDiceRerollCount", "sameDiceRerollType", "d66Type");

    self.$attr_reader("isPrintMaxDice", "upplerRollThreshold", "unlimitedRollDiceType");

    self.$attr_reader("defaultSuccessTarget", "rerollNumber", "fractionType");

    Opal.defn(self, '$postSet', TMP_7 = function $$postSet() {
      var self = this;

      return nil;
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$info', TMP_8 = function $$info() {
      var self = this;

      return $hash2(["name", "gameType", "prefixs", "info"], {"name": self.$gameName(), "gameType": self.$gameType(), "prefixs": self.$class().$prefixes(), "info": self.$getHelpMessage()});
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$gameName', TMP_9 = function $$gameName() {
      var self = this;

      return self.$gameType();
    }, TMP_9.$$arity = 0);

    Opal.defn(self, '$prefixes', TMP_10 = function $$prefixes() {
      var self = this;

      return self.$class().$prefixes();
    }, TMP_10.$$arity = 0);

    Opal.alias(self, 'prefixs', 'prefixes');

    Opal.defn(self, '$gameType', TMP_11 = function $$gameType() {
      var self = this;

      return self.gameType;
    }, TMP_11.$$arity = 0);

    Opal.defn(self, '$setGameType', TMP_12 = function $$setGameType(type) {
      var self = this;

      return self.gameType = type;
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$setSendMode', TMP_13 = function $$setSendMode(m) {
      var self = this;

      return self.sendMode = m;
    }, TMP_13.$$arity = 1);

    Opal.defn(self, '$upplerRollThreshold=', TMP_14 = function(v) {
      var self = this;

      return self.upplerRollThreshold = v;
    }, TMP_14.$$arity = 1);

    Opal.defn(self, '$bcdice=', TMP_15 = function(b) {
      var self = this;

      return (Opal.cvars['@@bcdice'] = b);
    }, TMP_15.$$arity = 1);

    Opal.defn(self, '$bcdice', TMP_16 = function $$bcdice() {
      var $a, self = this;

      return (($a = Opal.cvars['@@bcdice']) == null ? nil : $a);
    }, TMP_16.$$arity = 0);

    Opal.defn(self, '$rand', TMP_17 = function $$rand(max) {
      var $a, self = this;

      return (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$rand(max);
    }, TMP_17.$$arity = 1);

    Opal.defn(self, '$check_suc', TMP_18 = function $$check_suc($a_rest) {
      var $b, $c, self = this, params;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      params = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        params[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c)).$check_suc.apply($b, Opal.to_a(params));
    }, TMP_18.$$arity = -1);

    Opal.defn(self, '$roll', TMP_19 = function $$roll($a_rest) {
      var $b, $c, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c)).$roll.apply($b, Opal.to_a(args));
    }, TMP_19.$$arity = -1);

    Opal.defn(self, '$marshalSignOfInequality', TMP_20 = function $$marshalSignOfInequality($a_rest) {
      var $b, $c, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c)).$marshalSignOfInequality.apply($b, Opal.to_a(args));
    }, TMP_20.$$arity = -1);

    Opal.defn(self, '$unlimitedRollDiceType', TMP_21 = function $$unlimitedRollDiceType() {
      var $a, self = this;

      return (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$unlimitedRollDiceType();
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$sortType', TMP_22 = function $$sortType() {
      var self = this;

      return self.sortType;
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$setSortType', TMP_23 = function $$setSortType(s) {
      var self = this;

      return self.sortType = s;
    }, TMP_23.$$arity = 1);

    Opal.defn(self, '$d66', TMP_24 = function $$d66($a_rest) {
      var $b, $c, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c)).$getD66Value.apply($b, Opal.to_a(args));
    }, TMP_24.$$arity = -1);

    Opal.defn(self, '$rollDiceAddingUp', TMP_25 = function $$rollDiceAddingUp($a_rest) {
      var $b, $c, self = this, arg;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      arg = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        arg[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = (($c = Opal.cvars['@@bcdice']) == null ? nil : $c)).$rollDiceAddingUp.apply($b, Opal.to_a(arg));
    }, TMP_25.$$arity = -1);

    Opal.defn(self, '$getHelpMessage', TMP_26 = function $$getHelpMessage() {
      var self = this;

      return "";
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$parren_killer', TMP_27 = function $$parren_killer(string) {
      var $a, self = this;

      return (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$parren_killer(string);
    }, TMP_27.$$arity = 1);

    Opal.defn(self, '$changeText', TMP_28 = function $$changeText(string) {
      var self = this;

      self.$debug("DiceBot.parren_killer_add called");
      return string;
    }, TMP_28.$$arity = 1);

    Opal.defn(self, '$dice_command', TMP_29 = function $$dice_command(string, nick_e) {
      var $a, $b, self = this, secret_flg = nil, secretMarker = nil, command = nil, output_msg = nil;

      if ((($a = (self.$isGetOriginalMessage())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        string = (($a = Opal.cvars['@@bcdice']) == null ? nil : $a).$getOriginalMessage()};
      self.$debug("dice_command Begin string", string);
      secret_flg = false;
      if ((($a = self.$class().$prefixesPattern()['$=~'](string)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("not match in prefixes");
        return ["1", secret_flg];
      };
      secretMarker = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      command = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      command = self.$removeDiceCommandMessage(command);
      self.$debug("dicebot after command", command);
      self.$debug("match");
      $b = self.$rollDiceCommandCatched(command), $a = Opal.to_ary($b), output_msg = ($a[0] == null ? nil : $a[0]), secret_flg = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (((($b = output_msg['$nil?']()) !== false && $b !== nil && $b != null) ? $b : output_msg['$empty?']()))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output_msg = "1"};
      ((($a = secret_flg) !== false && $a !== nil && $a != null) ? $a : secret_flg = false);
      if ((($a = (output_msg['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output_msg = "" + (nick_e) + ": " + (output_msg)};
      if ((($a = (secretMarker)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (output_msg['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          secret_flg = true}};
      return [output_msg, secret_flg];
    }, TMP_29.$$arity = 2);

    Opal.defn(self, '$isGetOriginalMessage', TMP_30 = function $$isGetOriginalMessage() {
      var self = this;

      return false;
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$removeDiceCommandMessage', TMP_31 = function $$removeDiceCommandMessage(command) {
      var self = this;

      return command.$sub(/[\s　].+/, "");
    }, TMP_31.$$arity = 1);

    Opal.defn(self, '$rollDiceCommandCatched', TMP_32 = function $$rollDiceCommandCatched(command) {
      var $a, $b, self = this, result = nil, secret_flg = nil, e = nil;
      if ($gvars["@"] == null) $gvars["@"] = nil;

      result = nil;
      try {
        self.$debug("call rollDiceCommand command", command);
        $b = self.$rollDiceCommand(command), $a = Opal.to_ary($b), result = ($a[0] == null ? nil : $a[0]), secret_flg = ($a[1] == null ? nil : $a[1]), $b;
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            self.$debug("executeCommand exception", e.$to_s(), $gvars["@"].$join("\n"))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
      self.$debug("rollDiceCommand result", result);
      return [result, secret_flg];
    }, TMP_32.$$arity = 1);

    Opal.defn(self, '$rollDiceCommand', TMP_33 = function $$rollDiceCommand(command) {
      var self = this;

      return nil;
    }, TMP_33.$$arity = 1);

    Opal.defn(self, '$setDiceText', TMP_34 = function $$setDiceText(diceText) {
      var self = this;

      self.$debug("setDiceText diceText", diceText);
      return self.diceText = diceText;
    }, TMP_34.$$arity = 1);

    Opal.defn(self, '$setDiffText', TMP_35 = function $$setDiffText(diffText) {
      var self = this;

      return self.diffText = diffText;
    }, TMP_35.$$arity = 1);

    Opal.defn(self, '$dice_command_xRn', TMP_36 = function $$dice_command_xRn(string, nick_e) {
      var self = this;

      return "";
    }, TMP_36.$$arity = 2);

    Opal.defn(self, '$check_2D6', TMP_37 = function $$check_2D6(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var self = this;

      return "";
    }, TMP_37.$$arity = 8);

    Opal.defn(self, '$check_nD6', TMP_38 = function $$check_nD6(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var self = this;

      return "";
    }, TMP_38.$$arity = 8);

    Opal.defn(self, '$check_nD10', TMP_39 = function $$check_nD10(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var self = this;

      return "";
    }, TMP_39.$$arity = 8);

    Opal.defn(self, '$check_1D100', TMP_40 = function $$check_1D100(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var self = this;

      return "";
    }, TMP_40.$$arity = 8);

    Opal.defn(self, '$check_1D20', TMP_41 = function $$check_1D20(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var self = this;

      return "";
    }, TMP_41.$$arity = 8);

    Opal.defn(self, '$get_table_by_2d6', TMP_42 = function $$get_table_by_2d6(table) {
      var self = this;

      return self.$get_table_by_nD6(table, 2);
    }, TMP_42.$$arity = 1);

    Opal.defn(self, '$get_table_by_1d6', TMP_43 = function $$get_table_by_1d6(table) {
      var self = this;

      return self.$get_table_by_nD6(table, 1);
    }, TMP_43.$$arity = 1);

    Opal.defn(self, '$get_table_by_nD6', TMP_44 = function $$get_table_by_nD6(table, count) {
      var self = this;

      return self.$get_table_by_nDx(table, count, 6);
    }, TMP_44.$$arity = 2);

    Opal.defn(self, '$get_table_by_nDx', TMP_45 = function $$get_table_by_nDx(table, count, diceType) {
      var $a, $b, self = this, num = nil, text = nil;

      $b = self.$roll(count, diceType), $a = Opal.to_ary($b), num = ($a[0] == null ? nil : $a[0]), $b;
      text = self.$getTableValue(table['$[]']($rb_minus(num, count)));
      if ((($a = (text['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ["1", 0]};
      return [text, num];
    }, TMP_45.$$arity = 3);

    Opal.defn(self, '$get_table_by_1d3', TMP_46 = function $$get_table_by_1d3(table) {
      var $a, $b, self = this, count = nil, num = nil, index = nil, text = nil;

      self.$debug("get_table_by_1d3");
      count = 1;
      $b = self.$roll(count, 6), $a = Opal.to_ary($b), num = ($a[0] == null ? nil : $a[0]), $b;
      self.$debug("num", num);
      index = ($rb_divide(($rb_minus(num, 1)), 2));
      self.$debug("index", index);
      text = table['$[]'](index);
      if ((($a = (text['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ["1", 0]};
      return [text, num];
    }, TMP_46.$$arity = 1);

    Opal.defn(self, '$getD66', TMP_47 = function $$getD66(isSwap) {
      var self = this, number = nil;

      return number = self.$bcdice().$getD66(isSwap);
    }, TMP_47.$$arity = 1);

    Opal.defn(self, '$get_table_by_d66_swap', TMP_48 = function $$get_table_by_d66_swap(table) {
      var self = this, isSwap = nil, number = nil;

      isSwap = true;
      number = self.$bcdice().$getD66(isSwap);
      return [self.$get_table_by_number(number, table), number];
    }, TMP_48.$$arity = 1);

    Opal.defn(self, '$get_table_by_d66', TMP_49 = function $$get_table_by_d66(table) {
      var $a, $b, self = this, dice1 = nil, dummy = nil, dice2 = nil, num = nil, text = nil, indexText = nil;

      $b = self.$roll(1, 6), $a = Opal.to_ary($b), dice1 = ($a[0] == null ? nil : $a[0]), dummy = ($a[1] == null ? nil : $a[1]), $b;
      $b = self.$roll(1, 6), $a = Opal.to_ary($b), dice2 = ($a[0] == null ? nil : $a[0]), dummy = ($a[1] == null ? nil : $a[1]), $b;
      num = $rb_plus($rb_times(($rb_minus(dice1, 1)), 6), ($rb_minus(dice2, 1)));
      text = table['$[]'](num);
      indexText = "" + (dice1) + (dice2);
      if ((($a = (text['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ["1", indexText]};
      return [text, indexText];
    }, TMP_49.$$arity = 1);

    Opal.defn(self, '$getDiceRolledAdditionalText', TMP_50 = function $$getDiceRolledAdditionalText(n1, n_max, dice_max) {
      var self = this;

      return "";
    }, TMP_50.$$arity = 3);

    Opal.defn(self, '$getDiceRevision', TMP_51 = function $$getDiceRevision(n_max, dice_max, total_n) {
      var self = this;

      return ["", 0];
    }, TMP_51.$$arity = 3);

    Opal.defn(self, '$changeDiceValueByDiceText', TMP_52 = function $$changeDiceValueByDiceText(dice_now, dice_str, isCheckSuccess, dice_max) {
      var self = this;

      return dice_now;
    }, TMP_52.$$arity = 4);

    Opal.defn(self, '$setRatingTable', TMP_53 = function $$setRatingTable(nick_e, tnick, channel_to_list) {
      var self = this;

      return "1";
    }, TMP_53.$$arity = 3);

    Opal.defn(self, '$getJackUpValueOnAddRoll', TMP_54 = function $$getJackUpValueOnAddRoll(dice_n) {
      var self = this;

      return 0;
    }, TMP_54.$$arity = 1);

    Opal.defn(self, '$isD9', TMP_55 = function $$isD9() {
      var self = this;

      return false;
    }, TMP_55.$$arity = 0);

    Opal.defn(self, '$getGrichText', TMP_56 = function $$getGrichText(numberSpot1, dice_cnt_total, suc) {
      var self = this;

      return "";
    }, TMP_56.$$arity = 3);

    Opal.defn(self, '$check2dCritical', TMP_57 = function $$check2dCritical(critical, dice_new, dice_arry, loop_count) {
      var self = this;

      return nil;
    }, TMP_57.$$arity = 4);

    Opal.defn(self, '$is2dCritical', TMP_58 = function $$is2dCritical() {
      var self = this;

      return false;
    }, TMP_58.$$arity = 0);

    Opal.defn(self, '$getDiceList', TMP_59 = function $$getDiceList() {
      var self = this;

      return self.$getDiceListFromDiceText(self.diceText);
    }, TMP_59.$$arity = 0);

    Opal.defn(self, '$getDiceListFromDiceText', TMP_61 = function $$getDiceListFromDiceText(diceText) {
      var $a, $b, TMP_60, self = this, diceList = nil, diceString = nil;

      self.$debug("getDiceList diceText", diceText);
      diceList = [];
      if ((($a = (/\[([\d,]+)\]/['$=~'](diceText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diceText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1))};
      if ((($a = (/([\d,]+)/['$=~'](diceText))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return diceList
      };
      diceString = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      diceList = ($a = ($b = diceString.$split(/,/)).$collect, $a.$$p = (TMP_60 = function(i){var self = TMP_60.$$s || this;
if (i == null) i = nil;
      return i.$to_i()}, TMP_60.$$s = self, TMP_60.$$arity = 1, TMP_60), $a).call($b);
      self.$debug("diceList", diceList);
      return diceList;
    }, TMP_61.$$arity = 1);

    Opal.defn(self, '$get_table_by_number', TMP_63 = function $$get_table_by_number(index, table, default$) {try {

      var $a, $b, TMP_62, self = this;

      if (default$ == null) {
        default$ = "1";
      }
      ($a = ($b = table).$each, $a.$$p = (TMP_62 = function(item){var self = TMP_62.$$s || this, $c, number = nil;
if (item == null) item = nil;
      number = item['$[]'](0);
        if ((($c = ($rb_ge(number, index))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          Opal.ret(self.$getTableValue(item['$[]'](1)))
          } else {
          return nil
        };}, TMP_62.$$s = self, TMP_62.$$arity = 1, TMP_62), $a).call($b);
      return self.$getTableValue(default$);
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_63.$$arity = -3);

    Opal.defn(self, '$getTableValue', TMP_64 = function $$getTableValue(data) {
      var $a, self = this;

      if ((($a = (data['$kind_of?']($scope.get('Proc')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return data.$call()};
      return data;
    }, TMP_64.$$arity = 1);

    return (Opal.defn(self, '$analyzeDiceCommandResultMethod', TMP_67 = function $$analyzeDiceCommandResultMethod(command) {try {

      var $a, $b, TMP_65, $c, TMP_66, self = this, methodList = nil;

      methodList = ($a = ($b = self.$public_methods()).$select, $a.$$p = (TMP_65 = function(method){var self = TMP_65.$$s || this;
if (method == null) method = nil;
      return /^get.+DiceCommandResult$/['$==='](method.$to_s())}, TMP_65.$$s = self, TMP_65.$$arity = 1, TMP_65), $a).call($b);
      ($a = ($c = methodList).$each, $a.$$p = (TMP_66 = function(method){var self = TMP_66.$$s || this, $d, result = nil;
if (method == null) method = nil;
      result = self.$send(method, command);
        if ((($d = result['$nil?']()) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
          return nil
          } else {
          Opal.ret(result)
        };}, TMP_66.$$s = self, TMP_66.$$arity = 1, TMP_66), $a).call($c);
      return nil;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_67.$$arity = 1), nil) && 'analyzeDiceCommandResultMethod';
  })($scope.base, null)
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
Opal.loaded(["diceBot/DiceBot"]);
/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$debug', '$gsub', '$new', '$const_get', '$to_s', '$===', '$downcase', '$map', '$to_proc', '$[]', '$raise', '$first', '$include?', '$each']);
  return (function($base, $super) {
    function $DiceBotLoader(){};
    var self = $DiceBotLoader = $klass($base, $super, 'DiceBotLoader', $DiceBotLoader);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_5;

    def.filenames = def.gameTitlePattern = def.diceBotClass = nil;
    Opal.defs(self, '$loadUnknownGame', TMP_1 = function $$loadUnknownGame(gameTitle) {
      var self = this, escapedGameTitle = nil, e = nil;

      self.$debug("loadUnknownGame gameTitle", gameTitle);
      escapedGameTitle = gameTitle.$gsub(/(\.\.|\/|:|-)/, "_");
      try {
        return $scope.get('Object').$const_get(gameTitle.$gsub(/[\.\/:-]/, "_")).$new()
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('LoadError'), $scope.get('StandardError')])) {e = $err;
          try {
            self.$debug("DiceBot load ERROR!!!", e.$to_s());
            return nil;
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_1.$$arity = 1);

    Opal.defn(self, '$initialize', TMP_2 = function $$initialize(gameTitlePattern, options) {
      var $a, $b, self = this, $case = nil, defaultFilenames = nil;

      if (options == null) {
        options = $hash2([], {});
      }
      $case = gameTitlePattern;if ($scope.get('String')['$===']($case)) {self.gameTitlePattern = [gameTitlePattern.$downcase()]}else if ($scope.get('Array')['$===']($case)) {self.gameTitlePattern = ($a = ($b = gameTitlePattern).$map, $a.$$p = "downcase".$to_proc(), $a).call($b)}else if ($scope.get('Regexp')['$===']($case)) {if ((($a = options['$[]']("filenames")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "options[:filenames] is required when gameTitlePattern is a Regexp")
      };
      self.gameTitlePattern = gameTitlePattern;}else {self.$raise($scope.get('TypeError'), "gameTitlePattern must be a String or an Array<String> or a Regexp")};
      defaultFilenames = (function() {$case = gameTitlePattern;if ($scope.get('String')['$===']($case)) {return [gameTitlePattern]}else if ($scope.get('Array')['$===']($case)) {return [gameTitlePattern.$first()]}else if ($scope.get('Regexp')['$===']($case)) {return []}else { return nil }})();
      self.filenames = ((($a = options['$[]']("filenames")) !== false && $a !== nil && $a != null) ? $a : defaultFilenames);
      return self.diceBotClass = ((($a = options['$[]']("class")) !== false && $a !== nil && $a != null) ? $a : self.filenames.$first());
    }, TMP_2.$$arity = -2);

    Opal.defn(self, '$match?', TMP_3 = function(gameTitle) {
      var self = this, $case = nil;

      return (function() {$case = self.gameTitlePattern;if ($scope.get('Array')['$===']($case)) {return self.gameTitlePattern['$include?'](gameTitle.$downcase())}else if ($scope.get('Regexp')['$===']($case)) {return self.gameTitlePattern['$==='](gameTitle)}else { return nil }})();
    }, TMP_3.$$arity = 1);

    return (Opal.defn(self, '$loadDiceBot', TMP_5 = function $$loadDiceBot() {
      var $a, $b, TMP_4, self = this;

      ($a = ($b = self.filenames).$each, $a.$$p = (TMP_4 = function(filename){var self = TMP_4.$$s || this;
if (filename == null) filename = nil;
      return nil}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4), $a).call($b);
      return $scope.get('Object').$const_get(self.diceBotClass).$new();
    }, TMP_5.$$arity = 0), nil) && 'loadDiceBot';
  })($scope.base, null)
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
Opal.loaded(["diceBot/DiceBotLoader"]);
/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$debug', '$gsub', '$new', '$const_get', '$to_s', '$===', '$downcase', '$map', '$to_proc', '$[]', '$raise', '$first', '$include?', '$each']);
  return (function($base, $super) {
    function $DiceBotLoader(){};
    var self = $DiceBotLoader = $klass($base, $super, 'DiceBotLoader', $DiceBotLoader);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_5;

    def.filenames = def.gameTitlePattern = def.diceBotClass = nil;
    Opal.defs(self, '$loadUnknownGame', TMP_1 = function $$loadUnknownGame(gameTitle) {
      var self = this, escapedGameTitle = nil, e = nil;

      self.$debug("loadUnknownGame gameTitle", gameTitle);
      escapedGameTitle = gameTitle.$gsub(/(\.\.|\/|:|-)/, "_");
      try {
        return $scope.get('Object').$const_get(gameTitle.$gsub(/[\.\/:-]/, "_")).$new()
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('LoadError'), $scope.get('StandardError')])) {e = $err;
          try {
            self.$debug("DiceBot load ERROR!!!", e.$to_s());
            return nil;
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_1.$$arity = 1);

    Opal.defn(self, '$initialize', TMP_2 = function $$initialize(gameTitlePattern, options) {
      var $a, $b, self = this, $case = nil, defaultFilenames = nil;

      if (options == null) {
        options = $hash2([], {});
      }
      $case = gameTitlePattern;if ($scope.get('String')['$===']($case)) {self.gameTitlePattern = [gameTitlePattern.$downcase()]}else if ($scope.get('Array')['$===']($case)) {self.gameTitlePattern = ($a = ($b = gameTitlePattern).$map, $a.$$p = "downcase".$to_proc(), $a).call($b)}else if ($scope.get('Regexp')['$===']($case)) {if ((($a = options['$[]']("filenames")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise($scope.get('ArgumentError'), "options[:filenames] is required when gameTitlePattern is a Regexp")
      };
      self.gameTitlePattern = gameTitlePattern;}else {self.$raise($scope.get('TypeError'), "gameTitlePattern must be a String or an Array<String> or a Regexp")};
      defaultFilenames = (function() {$case = gameTitlePattern;if ($scope.get('String')['$===']($case)) {return [gameTitlePattern]}else if ($scope.get('Array')['$===']($case)) {return [gameTitlePattern.$first()]}else if ($scope.get('Regexp')['$===']($case)) {return []}else { return nil }})();
      self.filenames = ((($a = options['$[]']("filenames")) !== false && $a !== nil && $a != null) ? $a : defaultFilenames);
      return self.diceBotClass = ((($a = options['$[]']("class")) !== false && $a !== nil && $a != null) ? $a : self.filenames.$first());
    }, TMP_2.$$arity = -2);

    Opal.defn(self, '$match?', TMP_3 = function(gameTitle) {
      var self = this, $case = nil;

      return (function() {$case = self.gameTitlePattern;if ($scope.get('Array')['$===']($case)) {return self.gameTitlePattern['$include?'](gameTitle.$downcase())}else if ($scope.get('Regexp')['$===']($case)) {return self.gameTitlePattern['$==='](gameTitle)}else { return nil }})();
    }, TMP_3.$$arity = 1);

    return (Opal.defn(self, '$loadDiceBot', TMP_5 = function $$loadDiceBot() {
      var $a, $b, TMP_4, self = this;

      ($a = ($b = self.filenames).$each, $a.$$p = (TMP_4 = function(filename){var self = TMP_4.$$s || this;
if (filename == null) filename = nil;
      return nil}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4), $a).call($b);
      return $scope.get('Object').$const_get(self.diceBotClass).$new();
    }, TMP_5.$$arity = 0), nil) && 'loadDiceBot';
  })($scope.base, null)
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
Opal.loaded(["diceBot/DiceBotLoader"]);
/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$strip', '$empty?', '$find', '$match?', '$new']);
  self.$require("diceBot/DiceBotLoader");
  return (function($base, $super) {
    function $DiceBotLoaderList(){};
    var self = $DiceBotLoaderList = $klass($base, $super, 'DiceBotLoaderList', $DiceBotLoaderList);

    var def = self.$$proto, $scope = self.$$scope, TMP_2;

    Opal.defs(self, '$find', TMP_2 = function $$find(gameTitle) {
      var $a, $b, TMP_1, self = this, strippedTitle = nil;
      if (self.loaders == null) self.loaders = nil;

      strippedTitle = gameTitle.$strip();
      if ((($a = strippedTitle['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      return ($a = ($b = self.loaders).$find, $a.$$p = (TMP_1 = function(loader){var self = TMP_1.$$s || this;
if (loader == null) loader = nil;
      return loader['$match?'](strippedTitle)}, TMP_1.$$s = self, TMP_1.$$arity = 1, TMP_1), $a).call($b);
    }, TMP_2.$$arity = 1);

    return self.loaders = [$scope.get('DiceBotLoader').$new(["Cthulhu", "COC"]), $scope.get('DiceBotLoader').$new(["Hieizan", "COCH"]), $scope.get('DiceBotLoader').$new(["Elric!", "EL"], $hash2(["filenames"], {"filenames": ["Elric"]})), $scope.get('DiceBotLoader').$new(["RuneQuest", "RQ"]), $scope.get('DiceBotLoader').$new(["Chill", "CH"]), $scope.get('DiceBotLoader').$new(["RoleMaster", "RM"]), $scope.get('DiceBotLoader').$new(["ShadowRun", "SR"]), $scope.get('DiceBotLoader').$new(["ShadowRun4", "SR4"]), $scope.get('DiceBotLoader').$new(["Pendragon", "PD"]), $scope.get('DiceBotLoader').$new(/\A(?:SwordWorld|SW)\s*2\.0\z/i, $hash2(["filenames", "class"], {"filenames": ["SwordWorld", "SwordWorld2_0"], "class": "SwordWorld2_0"})), $scope.get('DiceBotLoader').$new(["SwordWorld", "SW"]), $scope.get('DiceBotLoader').$new(["Arianrhod", "AR"]), $scope.get('DiceBotLoader').$new(/\A(?:Infinite\s*Fantasia|IF)\z/i, $hash2(["filenames"], {"filenames": ["InfiniteFantasia"]})), $scope.get('DiceBotLoader').$new("WARPS"), $scope.get('DiceBotLoader').$new(/\A(?:Demon\s*Parasite|DP)\z/i, $hash2(["filenames"], {"filenames": ["DemonParasite"]})), $scope.get('DiceBotLoader').$new(/\A(?:Parasite\s*Blood|PB)\z/i, $hash2(["filenames", "class"], {"filenames": ["DemonParasite", "ParasiteBlood"], "class": "ParasiteBlood"})), $scope.get('DiceBotLoader').$new(/\A(?:Gun\s*Dog|GD)\z/i, $hash2(["filenames"], {"filenames": ["Gundog"]})), $scope.get('DiceBotLoader').$new(/\A(?:Gun\s*Dog\s*Zero|GDZ)\z/i, $hash2(["filenames", "class"], {"filenames": ["Gundog", "GundogZero"], "class": "GundogZero"})), $scope.get('DiceBotLoader').$new(/\A(?:Tunnels\s*&\s*Trolls|TuT)\z/i, $hash2(["filenames"], {"filenames": ["TunnelsAndTrolls"]})), $scope.get('DiceBotLoader').$new(/\A(?:Nightmare\s*Hunter[=\s]*Deep|NHD)\z/i, $hash2(["filenames"], {"filenames": ["NightmareHunterDeep"]})), $scope.get('DiceBotLoader').$new(/\A(?:War\s*Hammer(FRP)?|WH)\z/i, $hash2(["filenames"], {"filenames": ["Warhammer"]})), $scope.get('DiceBotLoader').$new(/\A(?:Phantasm\s*Adventure|PA)\z/i, $hash2(["filenames"], {"filenames": ["PhantasmAdventure"]})), $scope.get('DiceBotLoader').$new(/\A(?:Chaos\s*Flare|CF)\z/i, $hash2(["filenames"], {"filenames": ["ChaosFlare"]})), $scope.get('DiceBotLoader').$new(/\A(?:Cthulhu\s*Tech|CT)\z/i, $hash2(["filenames"], {"filenames": ["CthulhuTech"]})), $scope.get('DiceBotLoader').$new(/\A(?:Tokumei\s*Tenkousei|ToT)\z/i, $hash2(["filenames"], {"filenames": ["TokumeiTenkousei"]})), $scope.get('DiceBotLoader').$new(/\A(?:Shinobi\s*Gami|SG)\z/i, $hash2(["filenames"], {"filenames": ["ShinobiGami"]})), $scope.get('DiceBotLoader').$new(/\A(?:Double\s*Cross|DX)\z/i, $hash2(["filenames"], {"filenames": ["DoubleCross"]})), $scope.get('DiceBotLoader').$new(/\A(?:Sata\s*Supe|SS)\z/i, $hash2(["filenames"], {"filenames": ["Satasupe"]})), $scope.get('DiceBotLoader').$new(/\A(?:Ars\s*Magica|AM)\z/i, $hash2(["filenames"], {"filenames": ["ArsMagica"]})), $scope.get('DiceBotLoader').$new(/\A(?:Dark\s*Blaze|DB)\z/i, $hash2(["filenames"], {"filenames": ["DarkBlaze"]})), $scope.get('DiceBotLoader').$new(/\A(?:Night\s*Wizard|NW)\z/i, $hash2(["filenames"], {"filenames": ["NightWizard"]})), $scope.get('DiceBotLoader').$new("TORG", $hash2(["filenames"], {"filenames": ["Torg"]})), $scope.get('DiceBotLoader').$new(/\ATORG1.5\z/i, $hash2(["filenames", "class"], {"filenames": ["Torg", "Torg1_5"], "class": "Torg1_5"})), $scope.get('DiceBotLoader').$new(/\A(?:hunters\s*moon|HM)\z/i, $hash2(["filenames"], {"filenames": ["HuntersMoon"]})), $scope.get('DiceBotLoader').$new(/\A(?:Blood\s*Crusade|BC)\z/i, $hash2(["filenames"], {"filenames": ["BloodCrusade"]})), $scope.get('DiceBotLoader').$new(/\A(?:Meikyu\s*Kingdom|MK)\z/i, $hash2(["filenames"], {"filenames": ["MeikyuKingdom"]})), $scope.get('DiceBotLoader').$new(/\A(?:Earth\s*Dawn|ED)\z/i, $hash2(["filenames"], {"filenames": ["EarthDawn"]})), $scope.get('DiceBotLoader').$new(/\A(?:(?:Earth\s*Dawn|ED)3)\z/i, $hash2(["filenames", "class"], {"filenames": ["EarthDawn", "EarthDawn3"], "class": "EarthDawn3"})), $scope.get('DiceBotLoader').$new(/\A(?:(?:Earth\s*Dawn|ED)4)\z/i, $hash2(["filenames", "class"], {"filenames": ["EarthDawn", "EarthDawn4"], "class": "EarthDawn4"})), $scope.get('DiceBotLoader').$new(/\A(?:Embryo\s*Machine|EM)\z/i, $hash2(["filenames"], {"filenames": ["EmbryoMachine"]})), $scope.get('DiceBotLoader').$new(/\A(?:Gehenna\s*An|GA)\z/i, $hash2(["filenames"], {"filenames": ["GehennaAn"]})), $scope.get('DiceBotLoader').$new(/\A(?:Magica\s*Logia|ML)\z/i, $hash2(["filenames"], {"filenames": ["MagicaLogia"]})), $scope.get('DiceBotLoader').$new(["Nechronica", "NC"]), $scope.get('DiceBotLoader').$new(/\A(?:Meikyu\s*Days|MD)\z/i, $hash2(["filenames"], {"filenames": ["MeikyuDays"]})), $scope.get('DiceBotLoader').$new(["Peekaboo", "PK"]), $scope.get('DiceBotLoader').$new(/\A(?:Barna\s*Kronika|BK)\z/i, $hash2(["filenames"], {"filenames": ["BarnaKronika"]})), $scope.get('DiceBotLoader').$new(["RokumonSekai2", "RS2"]), $scope.get('DiceBotLoader').$new(/\A(?:Monotone\s*Musium|MM)\z/i, $hash2(["filenames"], {"filenames": ["MonotoneMusium"]})), $scope.get('DiceBotLoader').$new(/\AZettai\s*Reido\z/i, $hash2(["filenames"], {"filenames": ["ZettaiReido"]})), $scope.get('DiceBotLoader').$new(/\AEclipse\s*Phase\z/i, $hash2(["filenames"], {"filenames": ["EclipsePhase"]})), $scope.get('DiceBotLoader').$new("NJSLYRBATTLE", $hash2(["filenames"], {"filenames": ["NjslyrBattle"]})), $scope.get('DiceBotLoader').$new(["ShinMegamiTenseiKakuseihen", "SMTKakuseihen"]), $scope.get('DiceBotLoader').$new("Ryutama"), $scope.get('DiceBotLoader').$new("CardRanker"), $scope.get('DiceBotLoader').$new("ShinkuuGakuen"), $scope.get('DiceBotLoader').$new("CrashWorld"), $scope.get('DiceBotLoader').$new("WitchQuest"), $scope.get('DiceBotLoader').$new("BattleTech"), $scope.get('DiceBotLoader').$new("Elysion"), $scope.get('DiceBotLoader').$new("GeishaGirlwithKatana"), $scope.get('DiceBotLoader').$new("GURPS", $hash2(["filenames"], {"filenames": ["Gurps"]})), $scope.get('DiceBotLoader').$new("GurpsFW"), $scope.get('DiceBotLoader').$new("FilledWith"), $scope.get('DiceBotLoader').$new("HarnMaster"), $scope.get('DiceBotLoader').$new("Insane"), $scope.get('DiceBotLoader').$new("KillDeathBusiness"), $scope.get('DiceBotLoader').$new("Kamigakari"), $scope.get('DiceBotLoader').$new("RecordOfSteam"), $scope.get('DiceBotLoader').$new("Oukahoushin3rd"), $scope.get('DiceBotLoader').$new("BeastBindTrinity"), $scope.get('DiceBotLoader').$new("BloodMoon"), $scope.get('DiceBotLoader').$new("Utakaze"), $scope.get('DiceBotLoader').$new("EndBreaker"), $scope.get('DiceBotLoader').$new("KanColle"), $scope.get('DiceBotLoader').$new("GranCrest"), $scope.get('DiceBotLoader').$new("HouraiGakuen"), $scope.get('DiceBotLoader').$new("TwilightGunsmoke"), $scope.get('DiceBotLoader').$new("Garako"), $scope.get('DiceBotLoader').$new("ShoujoTenrankai"), $scope.get('DiceBotLoader').$new("GardenOrder"), $scope.get('DiceBotLoader').$new("None", $hash2(["filenames", "class"], {"filenames": [], "class": "DiceBot"}))];
  })($scope.base, null);
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);
Opal.loaded(["diceBot/DiceBotLoaderList"]);
/* Generated by Opal 0.10.5 */
Opal.modules["dice/AddDice"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$nick_e', '$debug', '$=~', '$marshalSignOfInequality', '$split', '$each', '$each_with_index', '$empty?', '$rollDiceAddingUp', '$==', '$+', '$*', '$>', '$sendMode', '$getOperatorText', '$!=', '$setDiceText', '$setDiffText', '$getDiceRevision', '$check_suc', '$getDiceRolledAdditionalText', '$sameDiceRerollCount', '$<=', '$sameDiceRerollType', '$!', '$parren_killer', '$to_i', '$is2dCritical', '$rollDiceAddingUpCommand', '$<', '$push', '$shift', '$&', '$sortType', '$rollLocal', '$[]', '$getSlashedDice', '$>=', '$addDiceArrayByAddDiceCount', '$check2dCritical', '$changeDiceValueByDiceText', '$collect', '$times', '$-', '$[]=', '$===', '$/', '$ceil', '$round', '$floor', '$rollD66', '$roll', '$<<', '$getD66Value', '$inject', '$join', '$length']);
  return (function($base, $super) {
    function $AddDice(){};
    var self = $AddDice = $klass($base, $super, 'AddDice', $AddDice);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_4, TMP_6, TMP_7, TMP_12, TMP_13, TMP_14, TMP_19, TMP_20, TMP_21, TMP_22;

    def.bcdice = def.diceBot = def.nick_e = nil;
    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(bcdice, diceBot) {
      var self = this;

      self.bcdice = bcdice;
      self.diceBot = diceBot;
      return self.nick_e = self.bcdice.$nick_e();
    }, TMP_1.$$arity = 2);

    Opal.defn(self, '$rollDice', TMP_4 = function $$rollDice(string) {
      var $a, $b, TMP_2, $c, self = this, judgeText = nil, judgeOperator = nil, diffText = nil, signOfInequality = nil, isCheckSuccess = nil, dice_cnt = nil, dice_max = nil, total_n = nil, dice_n = nil, output = nil, n1 = nil, n_max = nil, addUpTextList = nil, addText = nil, revision = nil, successText = nil;

      self.$debug("AddDice.rollDice() begin string", string);
      if ((($a = (/(^|\s)S?(([\d\+\*\-]*[\d]+D[\d\/UR@]*[\d\+\*\-D\/UR]*)(([<>=]+)([?\-\d]+))?)($|\s)/i['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return "1"
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      judgeText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      judgeOperator = (($a = $gvars['~']) === nil ? nil : $a['$[]'](5));
      diffText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](6));
      signOfInequality = "";
      isCheckSuccess = false;
      if ((($a = (judgeText)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        isCheckSuccess = true;
        string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
        signOfInequality = self.bcdice.$marshalSignOfInequality(judgeOperator);};
      dice_cnt = 0;
      dice_max = 0;
      total_n = 0;
      dice_n = 0;
      output = "";
      n1 = 0;
      n_max = 0;
      addUpTextList = string.$split(/\+/);
      ($a = ($b = addUpTextList).$each, $a.$$p = (TMP_2 = function(addUpText){var self = TMP_2.$$s || this, $c, $d, TMP_3, subtractTextList = nil;
if (addUpText == null) addUpText = nil;
      subtractTextList = addUpText.$split(/-/);
        return ($c = ($d = subtractTextList).$each_with_index, $c.$$p = (TMP_3 = function(subtractText, index){var self = TMP_3.$$s || this, $e, $f, dice_now = nil, dice_n_wk = nil, dice_str = nil, n1_wk = nil, n_max_wk = nil, cnt_wk = nil, max_wk = nil, rate = nil, operatorText = nil;
          if (self.diceBot == null) self.diceBot = nil;
if (subtractText == null) subtractText = nil;if (index == null) index = nil;
        if ((($e = (subtractText['$empty?']())) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            return nil;};
          self.$debug("begin rollDiceAddingUp(subtractText, isCheckSuccess)", subtractText, isCheckSuccess);
          $f = self.$rollDiceAddingUp(subtractText, isCheckSuccess), $e = Opal.to_ary($f), dice_now = ($e[0] == null ? nil : $e[0]), dice_n_wk = ($e[1] == null ? nil : $e[1]), dice_str = ($e[2] == null ? nil : $e[2]), n1_wk = ($e[3] == null ? nil : $e[3]), n_max_wk = ($e[4] == null ? nil : $e[4]), cnt_wk = ($e[5] == null ? nil : $e[5]), max_wk = ($e[6] == null ? nil : $e[6]), $f;
          self.$debug("end rollDiceAddingUp(subtractText, isCheckSuccess) -> dice_now", dice_now);
          rate = ((function() {if (index['$=='](0)) {
            return 1
            } else {
            return -1
          }; return nil; })());
          total_n = $rb_plus(total_n, $rb_times((dice_now), rate));
          dice_n = $rb_plus(dice_n, $rb_times(dice_n_wk, rate));
          n1 = $rb_plus(n1, n1_wk);
          n_max = $rb_plus(n_max, n_max_wk);
          dice_cnt = $rb_plus(dice_cnt, cnt_wk);
          if ((($e = ($rb_gt(max_wk, dice_max))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            dice_max = max_wk};
          if ((($e = (self.diceBot.$sendMode()['$=='](0))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            return nil;};
          operatorText = self.$getOperatorText(rate, output);
          return output = $rb_plus(output, "" + (operatorText) + (dice_str));}, TMP_3.$$s = self, TMP_3.$$arity = 2, TMP_3), $c).call($d);}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2), $a).call($b);
      if ((($a = (signOfInequality['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        string = $rb_plus(string, "" + (signOfInequality) + (diffText))};
      self.diceBot.$setDiceText(output);
      self.diceBot.$setDiffText(diffText);
      $c = self.diceBot.$getDiceRevision(n_max, dice_max, total_n), $a = Opal.to_ary($c), addText = ($a[0] == null ? nil : $a[0]), revision = ($a[1] == null ? nil : $a[1]), $c;
      self.$debug("addText, revision", addText, revision);
      self.$debug("@nick_e", self.nick_e);
      if ((($a = ($rb_gt(self.diceBot.$sendMode(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (output['$=~'](/[^\d\[\]]+/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (output) + " ＞ " + (total_n) + (addText)
          } else {
          output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (total_n) + (addText)
        }
        } else {
        output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (total_n) + (addText)
      };
      total_n = $rb_plus(total_n, revision);
      if ((($a = (signOfInequality['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        successText = self.bcdice.$check_suc(total_n, dice_n, signOfInequality, diffText, dice_cnt, dice_max, n1, n_max);
        self.$debug("check_suc successText", successText);
        output = $rb_plus(output, successText);};
      output = $rb_plus(output, self.diceBot.$getDiceRolledAdditionalText(n1, n_max, dice_max));
      if ((($a = (((($c = (dice_cnt['$=='](0))) !== false && $c !== nil && $c != null) ? $c : (dice_max['$=='](0))))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "1"};
      self.$debug("AddDice.rollDice() end output", output);
      return output;
    }, TMP_4.$$arity = 1);

    Opal.defn(self, '$rollDiceAddingUp', TMP_6 = function $$rollDiceAddingUp(string, isCheckSuccess) {try {

      var $a, $b, TMP_5, self = this, dice_max = nil, dice_total = nil, dice_n = nil, output = nil, n1 = nil, n_max = nil, dice_cnt_total = nil, double_check = nil, reg2 = nil, reg3 = nil, reg4 = nil, reg5 = nil, reg6 = nil, reg7 = nil, reg8 = nil, emptyResult = nil, mul_cmd = nil;

      if (isCheckSuccess == null) {
        isCheckSuccess = false;
      }
      self.$debug("rollDiceAddingUp() begin string", string);
      dice_max = 0;
      dice_total = 1;
      dice_n = 0;
      output = "";
      n1 = 0;
      n_max = 0;
      dice_cnt_total = 0;
      double_check = false;
      if ((($a = (self.diceBot.$sameDiceRerollCount()['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ($rb_le(self.diceBot.$sameDiceRerollType(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$debug("判定のみ振り足し");
          if ((($a = (isCheckSuccess)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            double_check = true};
        } else if ((($a = ($rb_le(self.diceBot.$sameDiceRerollType(), 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$debug("ダメージのみ振り足し");
          if ((($a = (isCheckSuccess['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            double_check = true};
          } else {
          double_check = true
        }};
      self.$debug("double_check", double_check);
      while ((($b = (/(^([\d]+\*[\d]+)\*(.+)|(.+)\*([\d]+\*[\d]+)$|(.+)\*([\d]+\*[\d]+)\*(.+))/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      reg2 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2));
      reg3 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3));
      reg4 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](4));
      reg5 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](5));
      reg6 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](6));
      reg7 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](7));
      reg8 = (($b = $gvars['~']) === nil ? nil : $b['$[]'](8));
      if ((($b = (reg2)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        string = $rb_plus($rb_plus(self.$parren_killer($rb_plus($rb_plus("(", reg2), ")")), "*"), reg3)
      } else if ((($b = (reg5)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        string = $rb_plus($rb_plus(reg4, "*"), self.$parren_killer($rb_plus($rb_plus("(", reg5), ")")))
      } else if ((($b = (reg7)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        string = $rb_plus($rb_plus($rb_plus($rb_plus(reg6, "*"), self.$parren_killer($rb_plus($rb_plus("(", reg7), ")"))), "*"), reg8)};};
      self.$debug("string", string);
      emptyResult = [dice_total, dice_n, output, n1, n_max, dice_cnt_total, dice_max];
      mul_cmd = string.$split(/\*/);
      ($a = ($b = mul_cmd).$each, $a.$$p = (TMP_5 = function(mul_line){var self = TMP_5.$$s || this, $c, $d, dice_count = nil, critical = nil, slashMark = nil, dice_now = nil, output_tmp = nil, n1_count = nil, max_number_tmp = nil, result_dice_count = nil;
        if (self.diceBot == null) self.diceBot = nil;
        if ($gvars.DICE_MAXNUM == null) $gvars.DICE_MAXNUM = nil;
if (mul_line == null) mul_line = nil;
      if ((($c = (/([\d]+)D([\d]+)(@(\d+))?(\/\d+[UR]?)?/i['$=~'](mul_line))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice_count = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1)).$to_i();
          dice_max = (($c = $gvars['~']) === nil ? nil : $c['$[]'](2)).$to_i();
          critical = (($c = $gvars['~']) === nil ? nil : $c['$[]'](4)).$to_i();
          slashMark = (($c = $gvars['~']) === nil ? nil : $c['$[]'](5));
          if ((($c = (($d = (critical['$!='](0)), $d !== false && $d !== nil && $d != null ?(self.diceBot.$is2dCritical()['$!']()) : $d))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            Opal.ret(emptyResult)};
          if ((($c = ($rb_gt(dice_max, $gvars.DICE_MAXNUM))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            Opal.ret(emptyResult)};
          $d = self.$rollDiceAddingUpCommand(dice_count, dice_max, slashMark, double_check, isCheckSuccess, critical), $c = Opal.to_ary($d), dice_max = ($c[0] == null ? nil : $c[0]), dice_now = ($c[1] == null ? nil : $c[1]), output_tmp = ($c[2] == null ? nil : $c[2]), n1_count = ($c[3] == null ? nil : $c[3]), max_number_tmp = ($c[4] == null ? nil : $c[4]), result_dice_count = ($c[5] == null ? nil : $c[5]), $d;
          if ((($c = (output['$!='](""))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            output = $rb_plus(output, "*")};
          output = $rb_plus(output, output_tmp);
          dice_total = $rb_times(dice_total, dice_now);
          dice_n = $rb_plus(dice_n, dice_now);
          dice_cnt_total = $rb_plus(dice_cnt_total, result_dice_count);
          n1 = $rb_plus(n1, n1_count);
          return n_max = $rb_plus(n_max, max_number_tmp);
          } else {
          mul_line = mul_line.$to_i();
          self.$debug("dice_total", dice_total);
          self.$debug("mul_line", mul_line);
          dice_total = $rb_times(dice_total, mul_line);
          if ((($c = (output['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            } else {
            output = $rb_plus(output, "*")
          };
          if ((($c = ($rb_lt(mul_line, 0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return output = $rb_plus(output, "(" + (mul_line) + ")")
            } else {
            return output = $rb_plus(output, "" + (mul_line))
          };
        }}, TMP_5.$$s = self, TMP_5.$$arity = 1, TMP_5), $a).call($b);
      self.$debug("rollDiceAddingUp() end output", dice_total, dice_n, output, n1, n_max, dice_cnt_total, dice_max);
      return [dice_total, dice_n, output, n1, n_max, dice_cnt_total, dice_max];
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_6.$$arity = -2);

    Opal.defn(self, '$rollDiceAddingUpCommand', TMP_7 = function $$rollDiceAddingUpCommand(dice_count, dice_max, slashMark, double_check, isCheckSuccess, critical) {
      var $a, $b, $c, self = this, result_dice_count = nil, dice_now = nil, n1_count = nil, max_number = nil, dice_str = nil, dice_arry = nil, loop_count = nil, dice_wk = nil, dice_dat = nil, dice_new = nil, output = nil;

      result_dice_count = 0;
      dice_now = 0;
      n1_count = 0;
      max_number = 0;
      dice_str = "";
      dice_arry = [];
      dice_arry.$push(dice_count);
      loop_count = 0;
      self.$debug("before while dice_arry", dice_arry);
      while ((($b = (dice_arry['$empty?']()['$!']())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      self.$debug("IN while dice_arry", dice_arry);
      dice_wk = dice_arry.$shift();
      result_dice_count = $rb_plus(result_dice_count, dice_wk);
      self.$debug("dice_wk", dice_wk);
      self.$debug("dice_max", dice_max);
      self.$debug("(sortType & 1)", (self.diceBot.$sortType()['$&'](1)));
      dice_dat = self.$rollLocal(dice_wk, dice_max, (self.diceBot.$sortType()['$&'](1)));
      self.$debug("dice_dat", dice_dat);
      dice_new = dice_dat['$[]'](0);
      dice_now = $rb_plus(dice_now, dice_new);
      self.$debug("slashMark", slashMark);
      dice_now = self.$getSlashedDice(slashMark, dice_now);
      if ((($b = (dice_str['$!='](""))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        dice_str = $rb_plus(dice_str, "][")};
      self.$debug("dice_str", dice_str);
      dice_str = $rb_plus(dice_str, dice_dat['$[]'](1));
      n1_count = $rb_plus(n1_count, dice_dat['$[]'](2));
      max_number = $rb_plus(max_number, dice_dat['$[]'](3));
      if ((($b = ((($c = double_check !== false && double_check !== nil && double_check != null) ? ($rb_ge(dice_wk, 2)) : double_check))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$addDiceArrayByAddDiceCount(dice_dat, dice_max, dice_arry, dice_wk)};
      self.diceBot.$check2dCritical(critical, dice_new, dice_arry, loop_count);
      loop_count = $rb_plus(loop_count, 1);};
      dice_now = self.diceBot.$changeDiceValueByDiceText(dice_now, dice_str, isCheckSuccess, dice_max);
      output = "";
      if ((($a = ($rb_gt(self.diceBot.$sendMode(), 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "" + (dice_now) + "[" + (dice_str) + "]")
      } else if ((($a = ($rb_gt(self.diceBot.$sendMode(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "" + (dice_now))};
      return [dice_max, dice_now, output, n1_count, max_number, result_dice_count];
    }, TMP_7.$$arity = 6);

    Opal.defn(self, '$addDiceArrayByAddDiceCount', TMP_12 = function $$addDiceArrayByAddDiceCount(dice_dat, dice_max, dice_arry, dice_wk) {
      var $a, $b, TMP_8, $c, TMP_9, $d, TMP_10, $e, TMP_11, self = this, dice_num = nil, dice_face = nil;

      dice_num = ($a = ($b = dice_dat['$[]'](1).$split(/,/)).$collect, $a.$$p = (TMP_8 = function(s){var self = TMP_8.$$s || this;
if (s == null) s = nil;
      return s.$to_i()}, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8), $a).call($b);
      dice_face = [];
      ($a = ($c = dice_max).$times, $a.$$p = (TMP_9 = function(i){var self = TMP_9.$$s || this;
if (i == null) i = nil;
      return dice_face.$push(0)}, TMP_9.$$s = self, TMP_9.$$arity = 1, TMP_9), $a).call($c);
      ($a = ($d = dice_num).$each, $a.$$p = (TMP_10 = function(dice_o){var self = TMP_10.$$s || this, $e, $f;
if (dice_o == null) dice_o = nil;
      return ($e = $rb_minus(dice_o, 1), $f = dice_face, $f['$[]=']($e, $rb_plus($f['$[]']($e), 1)))}, TMP_10.$$s = self, TMP_10.$$arity = 1, TMP_10), $a).call($d);
      return ($a = ($e = dice_face).$each, $a.$$p = (TMP_11 = function(dice_o){var self = TMP_11.$$s || this, $f;
        if (self.diceBot == null) self.diceBot = nil;
if (dice_o == null) dice_o = nil;
      if ((($f = (self.diceBot.$sameDiceRerollCount()['$=='](1))) !== nil && $f != null && (!$f.$$is_boolean || $f == true))) {
          if ((($f = (dice_o['$=='](dice_wk))) !== nil && $f != null && (!$f.$$is_boolean || $f == true))) {
            return dice_arry.$push(dice_o)
            } else {
            return nil
          }
        } else if ((($f = ($rb_ge(dice_o, self.diceBot.$sameDiceRerollCount()))) !== nil && $f != null && (!$f.$$is_boolean || $f == true))) {
          return dice_arry.$push(dice_o)
          } else {
          return nil
        }}, TMP_11.$$s = self, TMP_11.$$arity = 1, TMP_11), $a).call($e);
    }, TMP_12.$$arity = 4);

    Opal.defn(self, '$getSlashedDice', TMP_13 = function $$getSlashedDice(slashMark, dice) {
      var $a, self = this, rate = nil, mark = nil, value = nil, $case = nil;

      if ((($a = (/^\/(\d+)(.)?$/i['$==='](slashMark))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return dice
      };
      rate = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
      mark = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      if ((($a = (rate['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return dice};
      value = ($rb_divide($rb_times(1.0, dice), rate));
      $case = mark;if ("U"['$===']($case)) {dice = value.$ceil()}else if ("R"['$===']($case)) {dice = value.$round()}else {dice = value.$floor()};
      return dice;
    }, TMP_13.$$arity = 2);

    Opal.defn(self, '$rollLocal', TMP_14 = function $$rollLocal(dice_wk, dice_max, sortType) {
      var $a, self = this;

      if ((($a = (dice_max['$=='](66))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$rollD66(dice_wk)};
      return self.bcdice.$roll(dice_wk, dice_max, sortType);
    }, TMP_14.$$arity = 3);

    Opal.defn(self, '$rollD66', TMP_19 = function $$rollD66(count) {
      var $a, $b, TMP_15, $c, TMP_16, $d, TMP_17, $e, TMP_18, self = this, d66List = nil, total = nil, text = nil, n1Count = nil, nMaxCount = nil, result = nil;

      d66List = [];
      ($a = ($b = count).$times, $a.$$p = (TMP_15 = function(i){var self = TMP_15.$$s || this;
        if (self.bcdice == null) self.bcdice = nil;
if (i == null) i = nil;
      return d66List['$<<'](self.bcdice.$getD66Value())}, TMP_15.$$s = self, TMP_15.$$arity = 1, TMP_15), $a).call($b);
      total = ($a = ($c = d66List).$inject, $a.$$p = (TMP_16 = function(sum, i){var self = TMP_16.$$s || this;
if (sum == null) sum = nil;if (i == null) i = nil;
      return $rb_plus(sum, i)}, TMP_16.$$s = self, TMP_16.$$arity = 2, TMP_16), $a).call($c);
      text = d66List.$join(",");
      n1Count = ($a = ($d = d66List).$collect, $a.$$p = (TMP_17 = function(i){var self = TMP_17.$$s || this;
if (i == null) i = nil;
      return i['$=='](1)}, TMP_17.$$s = self, TMP_17.$$arity = 1, TMP_17), $a).call($d).$length();
      nMaxCount = ($a = ($e = d66List).$collect, $a.$$p = (TMP_18 = function(i){var self = TMP_18.$$s || this;
if (i == null) i = nil;
      return i['$=='](66)}, TMP_18.$$s = self, TMP_18.$$arity = 1, TMP_18), $a).call($e).$length();
      return result = [total, text, n1Count, nMaxCount, 0, 0, 0];
    }, TMP_19.$$arity = 1);

    Opal.defn(self, '$marshalSignOfInequality', TMP_20 = function $$marshalSignOfInequality($a_rest) {
      var $b, self = this, arg;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      arg = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        arg[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = self.bcdice).$marshalSignOfInequality.apply($b, Opal.to_a(arg));
    }, TMP_20.$$arity = -1);

    Opal.defn(self, '$getOperatorText', TMP_21 = function $$getOperatorText(rate, output) {
      var $a, self = this;

      if ((($a = ($rb_lt(rate, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "-"};
      if ((($a = (output['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      return "+";
    }, TMP_21.$$arity = 2);

    return (Opal.defn(self, '$parren_killer', TMP_22 = function $$parren_killer($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return ($b = self.bcdice).$parren_killer.apply($b, Opal.to_a(args));
    }, TMP_22.$$arity = -1), nil) && 'parren_killer';
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["dice/UpperDice"] = function(Opal) {
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
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
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$nick_e', '$debug', '$gsub', '$=~', '$to_i', '$getMarshaledSignOfInequality', '$getAddRollUpperTarget', '$<=', '$split', '$+', '$each', '$push', '$getBonusValue', '$-', '$getUpperDiceCommandResult', '$>', '$<', '$isPrintMaxDice', '$!=', '$getMaxAndTotalValueResultStirng', '$length', '$==', '$upplerRollThreshold', '$empty?', '$join', '$parren_killer', '$collect', '$roll', '$&', '$sortType', '$<<']);
  return (function($base, $super) {
    function $UpperDice(){};
    var self = $UpperDice = $klass($base, $super, 'UpperDice', $UpperDice);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_3, TMP_4, TMP_5, TMP_6, TMP_9;

    def.bcdice = def.upper = def.nick_e = def.diceBot = def.signOfInequality = nil;
    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(bcdice, diceBot) {
      var self = this;

      self.bcdice = bcdice;
      self.diceBot = diceBot;
      return self.nick_e = self.bcdice.$nick_e();
    }, TMP_1.$$arity = 2);

    Opal.defn(self, '$rollDice', TMP_3 = function $$rollDice(string) {
      var $a, $b, TMP_2, $c, self = this, output = nil, command = nil, signOfInequalityText = nil, diff = nil, upperTarget1 = nil, upperTarget2 = nil, modify = nil, dice_a = nil, diceCommands = nil, bonusValues = nil, bonus = nil, diceDiff = nil, totalDiceString = nil, totalSuccessCount = nil, totalDiceCount = nil, maxDiceValue = nil, totalValue = nil, maxValue = nil;
      if ($gvars.SEND_STR_MAX == null) $gvars.SEND_STR_MAX = nil;

      self.$debug("udice begin string", string);
      output = "1";
      string = string.$gsub(/-[sS]?[\d]+[uU][\d]+/, "");
      if ((($a = (/(^|\s)[sS]?(\d+[uU][\d\+\-uU]+)(\[(\d+)\])?([\+\-\d]*)(([<>=]+)(\d+))?(\@(\d+))?($|\s)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      command = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      signOfInequalityText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](7));
      diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](8)).$to_i();
      upperTarget1 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      upperTarget2 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](10));
      modify = (($a = $gvars['~']) === nil ? nil : $a['$[]'](5));
      self.$debug("modify", modify);
      ((($a = modify) !== false && $a !== nil && $a != null) ? $a : modify = "");
      self.$debug("p $...", [(($a = $gvars['~']) === nil ? nil : $a['$[]'](1)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](3)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](4)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](5)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](6)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](7)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](8)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](9)), (($a = $gvars['~']) === nil ? nil : $a['$[]'](10))]);
      string = command;
      self.signOfInequality = self.bcdice.$getMarshaledSignOfInequality(signOfInequalityText);
      self.upper = self.$getAddRollUpperTarget(upperTarget1, upperTarget2);
      if ((($a = ($rb_le(self.upper, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (self.nick_e) + ": (" + (string) + "[" + (self.upper) + "]" + (modify) + ") ＞ 無限ロールの条件がまちがっています";
        return output;};
      dice_a = ($rb_plus(string, modify)).$split(/\+/);
      self.$debug("dice_a", dice_a);
      diceCommands = [];
      bonusValues = [];
      ($a = ($b = dice_a).$each, $a.$$p = (TMP_2 = function(dice_o){var self = TMP_2.$$s || this, $c;
if (dice_o == null) dice_o = nil;
      if ((($c = (/[Uu]/['$=~'](dice_o))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return diceCommands.$push(dice_o)
          } else {
          return bonusValues.$push(dice_o)
        }}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2), $a).call($b);
      bonus = self.$getBonusValue(bonusValues);
      self.$debug("bonus", bonus);
      diceDiff = $rb_minus(diff, bonus);
      $c = self.$getUpperDiceCommandResult(diceCommands, diceDiff), $a = Opal.to_ary($c), totalDiceString = ($a[0] == null ? nil : $a[0]), totalSuccessCount = ($a[1] == null ? nil : $a[1]), totalDiceCount = ($a[2] == null ? nil : $a[2]), maxDiceValue = ($a[3] == null ? nil : $a[3]), totalValue = ($a[4] == null ? nil : $a[4]), $c;
      output = totalDiceString;
      if ((($a = ($rb_gt(bonus, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "+" + (bonus))
      } else if ((($a = ($rb_lt(bonus, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "" + (bonus))};
      maxValue = $rb_plus(maxDiceValue, bonus);
      totalValue = $rb_plus(totalValue, bonus);
      string = $rb_plus(string, $rb_plus("[" + (self.upper) + "]", modify));
      if ((($a = (($c = self.diceBot.$isPrintMaxDice(), $c !== false && $c !== nil && $c != null ?($rb_gt(totalDiceCount, 1)) : $c))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (output) + " ＞ " + (totalValue)};
      if ((($a = (self.signOfInequality['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (output) + " ＞ 成功数" + (totalSuccessCount);
        string = $rb_plus(string, "" + (self.signOfInequality) + (diff));
        } else {
        output = $rb_plus(output, self.$getMaxAndTotalValueResultStirng(maxValue, totalValue, totalDiceCount))
      };
      output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (output);
      if ((($a = ($rb_gt(output.$length(), $gvars.SEND_STR_MAX))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "" + (self.nick_e) + ": (" + (string) + ") ＞ ... ＞ " + (totalValue);
        if ((($a = (self.signOfInequality['$=='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          output = $rb_plus(output, self.$getMaxAndTotalValueResultStirng(maxValue, totalValue, totalDiceCount))};};
      return output;
    }, TMP_3.$$arity = 1);

    Opal.defn(self, '$getMaxAndTotalValueResultStirng', TMP_4 = function $$getMaxAndTotalValueResultStirng(maxValue, totalValue, totalDiceCount) {
      var self = this;

      return " ＞ " + (maxValue) + "/" + (totalValue) + "(最大/合計)";
    }, TMP_4.$$arity = 3);

    Opal.defn(self, '$getAddRollUpperTarget', TMP_5 = function $$getAddRollUpperTarget(target1, target2) {
      var $a, self = this;

      if ((($a = (target1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return target1.$to_i()};
      if ((($a = (target2)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return target2.$to_i()};
      if ((($a = (self.diceBot.$upplerRollThreshold()['$==']("Max"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 2
        } else {
        return self.diceBot.$upplerRollThreshold()
      };
    }, TMP_5.$$arity = 2);

    Opal.defn(self, '$getBonusValue', TMP_6 = function $$getBonusValue(bonusValues) {
      var $a, self = this, diceBonusText = nil, bonus = nil;

      if ((($a = (bonusValues['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      diceBonusText = bonusValues.$join("+");
      bonus = self.bcdice.$parren_killer($rb_plus($rb_plus("(", diceBonusText), ")")).$to_i();
      return bonus;
    }, TMP_6.$$arity = 1);

    return (Opal.defn(self, '$getUpperDiceCommandResult', TMP_9 = function $$getUpperDiceCommandResult(diceCommands, diceDiff) {
      var $a, $b, TMP_7, self = this, diceStringList = nil, totalSuccessCount = nil, totalDiceCount = nil, maxDiceValue = nil, totalValue = nil, totalDiceString = nil;

      diceStringList = [];
      totalSuccessCount = 0;
      totalDiceCount = 0;
      maxDiceValue = 0;
      totalValue = 0;
      ($a = ($b = diceCommands).$each, $a.$$p = (TMP_7 = function(diceCommand){var self = TMP_7.$$s || this, $c, $d, $e, $f, TMP_8, diceCount = nil, diceMax = nil, total = nil, diceString = nil, cnt1 = nil, cnt_max = nil, maxDiceResult = nil, successCount = nil, cnt_re = nil;
        if (self.diceBot == null) self.diceBot = nil;
        if (self.bcdice == null) self.bcdice = nil;
        if (self.upper == null) self.upper = nil;
        if (self.signOfInequality == null) self.signOfInequality = nil;
if (diceCommand == null) diceCommand = nil;
      $d = ($e = ($f = diceCommand.$split(/[uU]/)).$collect, $e.$$p = (TMP_8 = function(s){var self = TMP_8.$$s || this;
if (s == null) s = nil;
        return s.$to_i()}, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8), $e).call($f), $c = Opal.to_ary($d), diceCount = ($c[0] == null ? nil : $c[0]), diceMax = ($c[1] == null ? nil : $c[1]), $d;
        if ((($c = (self.diceBot.$upplerRollThreshold()['$==']("Max"))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          self.upper = diceMax};
        $d = self.bcdice.$roll(diceCount, diceMax, (self.diceBot.$sortType()['$&'](2)), self.upper, self.signOfInequality, diceDiff), $c = Opal.to_ary($d), total = ($c[0] == null ? nil : $c[0]), diceString = ($c[1] == null ? nil : $c[1]), cnt1 = ($c[2] == null ? nil : $c[2]), cnt_max = ($c[3] == null ? nil : $c[3]), maxDiceResult = ($c[4] == null ? nil : $c[4]), successCount = ($c[5] == null ? nil : $c[5]), cnt_re = ($c[6] == null ? nil : $c[6]), $d;
        diceStringList['$<<'](diceString);
        totalSuccessCount = $rb_plus(totalSuccessCount, successCount);
        if ((($c = ($rb_gt(maxDiceResult, maxDiceValue))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          maxDiceValue = maxDiceResult};
        totalDiceCount = $rb_plus(totalDiceCount, diceCount);
        return totalValue = $rb_plus(totalValue, total);}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7), $a).call($b);
      totalDiceString = diceStringList.$join(",");
      return [totalDiceString, totalSuccessCount, totalDiceCount, maxDiceValue, totalValue];
    }, TMP_9.$$arity = 2), nil) && 'getUpperDiceCommandResult';
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["dice/RerollDice"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $gvars = Opal.gvars;

  Opal.add_stubs(['$nick_e', '$rollDiceCatched', '$+', '$to_s', '$debug', '$gsub', '$=~', '$to_i', '$marshalSignOfInequality', '$!=', '$defaultSuccessTarget', '$getRerollNumber', '$split', '$each', '$collect', '$checkReRollRule', '$roll', '$&', '$sortType', '$reRollNextDice', '$getGrichText', '$>', '$length', '$<=', '$loop', '$!', '$isReRollAgain', '$rerollNumber', '$nil?', '$raiseErroForJudgeRule', '$raise', '$===', '$>=', '$<']);
  return (function($base, $super) {
    function $RerollDice(){};
    var self = $RerollDice = $klass($base, $super, 'RerollDice', $RerollDice);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_5, TMP_7, TMP_8, TMP_9, TMP_10;

    def.bcdice = def.nick_e = def.diceBot = nil;
    Opal.defn(self, '$initialize', TMP_1 = function $$initialize(bcdice, diceBot) {
      var self = this;

      self.bcdice = bcdice;
      self.diceBot = diceBot;
      return self.nick_e = self.bcdice.$nick_e();
    }, TMP_1.$$arity = 2);

    Opal.defn(self, '$rollDice', TMP_2 = function $$rollDice(string) {
      var self = this, output = nil, e = nil;

      output = "";
      try {
        output = self.$rollDiceCatched(string)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            output = $rb_plus("" + (string) + " ＞ ", e.$to_s())
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
      return "" + (self.nick_e) + ": " + (output);
    }, TMP_2.$$arity = 1);

    Opal.defn(self, '$rollDiceCatched', TMP_5 = function $$rollDiceCatched(string) {
      var $a, $b, TMP_3, $c, self = this, successCount = nil, signOfInequality = nil, output = nil, next_roll = nil, rerollNumber_1 = nil, rerollNumber_2 = nil, judgeText = nil, operator = nil, diff = nil, rerollNumber = nil, numberSpot1Total = nil, dice_cnt_total = nil, dice_max = nil, dice_a = nil, output2 = nil, round = nil, success = nil, dice_cnt = nil;
      if ($gvars.SEND_STR_MAX == null) $gvars.SEND_STR_MAX = nil;

      self.$debug("RerollDice.rollDice string", string);
      successCount = 0;
      signOfInequality = "";
      output = "";
      next_roll = 0;
      string = string.$gsub(/-[\d]+R[\d]+/, "");
      if ((($a = (/(^|\s)S?([\d]+R[\d\+R]+)(\[(\d+)\])?(([<>=]+)([\d]+))?(\@(\d+))?($|\s)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("is invaild rdice", string);
        return "1";
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      rerollNumber_1 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      rerollNumber_2 = (($a = $gvars['~']) === nil ? nil : $a['$[]'](9));
      judgeText = (($a = $gvars['~']) === nil ? nil : $a['$[]'](5));
      operator = (($a = $gvars['~']) === nil ? nil : $a['$[]'](6));
      diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](7));
      if ((($a = (judgeText)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diff = diff.$to_i();
        signOfInequality = self.bcdice.$marshalSignOfInequality(operator);
      } else if ((($a = (self.diceBot.$defaultSuccessTarget()['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (self.diceBot.$defaultSuccessTarget()['$=~'](/([<>=]+)(\d+)/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          operator = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
          diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
          signOfInequality = self.bcdice.$marshalSignOfInequality(operator);}};
      rerollNumber = self.$getRerollNumber(rerollNumber_1, rerollNumber_2, judgeText, diff);
      self.$debug("rerollNumber", rerollNumber);
      self.$debug("diff", diff);
      numberSpot1Total = 0;
      dice_cnt_total = 0;
      dice_max = 0;
      dice_a = string.$split(/\+/);
      self.$debug("dice_a", dice_a);
      ($a = ($b = dice_a).$each, $a.$$p = (TMP_3 = function(dice_o){var self = TMP_3.$$s || this, $c, $d, $e, $f, TMP_4, dice_cnt = nil, total = nil, dice_str = nil, numberSpot1 = nil, cnt_max = nil, n_max = nil, success = nil, rerollCount = nil;
        if (self.bcdice == null) self.bcdice = nil;
        if (self.diceBot == null) self.diceBot = nil;
if (dice_o == null) dice_o = nil;
      self.$debug("dice_o", dice_o);
        $d = ($e = ($f = dice_o.$split(/[rR]/)).$collect, $e.$$p = (TMP_4 = function(s){var self = TMP_4.$$s || this;
if (s == null) s = nil;
        return s.$to_i()}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4), $e).call($f), $c = Opal.to_ary($d), dice_cnt = ($c[0] == null ? nil : $c[0]), dice_max = ($c[1] == null ? nil : $c[1]), $d;
        self.$debug("dice_cnt", dice_cnt);
        self.$debug("dice_max", dice_max);
        self.$checkReRollRule(dice_max, signOfInequality, diff);
        $d = self.bcdice.$roll(dice_cnt, dice_max, (self.diceBot.$sortType()['$&'](2)), 0, signOfInequality, diff, rerollNumber), $c = Opal.to_ary($d), total = ($c[0] == null ? nil : $c[0]), dice_str = ($c[1] == null ? nil : $c[1]), numberSpot1 = ($c[2] == null ? nil : $c[2]), cnt_max = ($c[3] == null ? nil : $c[3]), n_max = ($c[4] == null ? nil : $c[4]), success = ($c[5] == null ? nil : $c[5]), rerollCount = ($c[6] == null ? nil : $c[6]), $d;
        self.$debug("bcdice.roll : total, dice_str, numberSpot1, cnt_max, n_max, success, rerollCount", total, dice_str, numberSpot1, cnt_max, n_max, success, rerollCount);
        successCount = $rb_plus(successCount, success);
        if ((($c = (output['$!='](""))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          output = $rb_plus(output, ",")};
        output = $rb_plus(output, dice_str);
        next_roll = $rb_plus(next_roll, rerollCount);
        numberSpot1Total = $rb_plus(numberSpot1Total, numberSpot1);
        return dice_cnt_total = $rb_plus(dice_cnt_total, dice_cnt);}, TMP_3.$$s = self, TMP_3.$$arity = 1, TMP_3), $a).call($b);
      $c = self.$reRollNextDice(next_roll, dice_max, signOfInequality, diff, rerollNumber), $a = Opal.to_ary($c), output2 = ($a[0] == null ? nil : $a[0]), round = ($a[1] == null ? nil : $a[1]), success = ($a[2] == null ? nil : $a[2]), dice_cnt = ($a[3] == null ? nil : $a[3]), $c;
      successCount = $rb_plus(successCount, success);
      dice_cnt_total = $rb_plus(dice_cnt_total, dice_cnt);
      output = "" + (output) + (output2) + " ＞ 成功数" + (successCount);
      string = $rb_plus(string, "[" + (rerollNumber) + "]" + (signOfInequality) + (diff));
      self.$debug("string", string);
      output = $rb_plus(output, self.diceBot.$getGrichText(numberSpot1Total, dice_cnt_total, successCount));
      output = "(" + (string) + ") ＞ " + (output);
      if ((($a = ($rb_gt(output.$length(), $gvars.SEND_STR_MAX))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = "(" + (string) + ") ＞ ... ＞ 回転数" + (round) + " ＞ 成功数" + (successCount)};
      return output;
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$reRollNextDice', TMP_7 = function $$reRollNextDice(next_roll, dice_max, signOfInequality, diff, rerollNumber) {
      var $a, $b, TMP_6, self = this, dice_cnt = nil, output = nil, round = nil, successCount = nil, dice_cnt_total = nil;

      self.$debug("rerollNumber Begin");
      dice_cnt = next_roll;
      self.$debug("dice_cnt", dice_cnt);
      output = "";
      round = 0;
      successCount = 0;
      dice_cnt_total = 0;
      if ((($a = ($rb_le(next_roll, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [output, round, successCount, dice_cnt_total]};
      (function(){var $brk = Opal.new_brk(); try {return ($a = ($b = self).$loop, $a.$$p = (TMP_6 = function(){var self = TMP_6.$$s || this, $c, $d, total = nil, dice_str = nil, numberSpot1 = nil, cnt_max = nil, n_max = nil, success = nil, rerollCount = nil;
        if (self.bcdice == null) self.bcdice = nil;
        if (self.diceBot == null) self.diceBot = nil;

      $d = self.bcdice.$roll(dice_cnt, dice_max, (self.diceBot.$sortType()['$&'](2)), 0, signOfInequality, diff, rerollNumber), $c = Opal.to_ary($d), total = ($c[0] == null ? nil : $c[0]), dice_str = ($c[1] == null ? nil : $c[1]), numberSpot1 = ($c[2] == null ? nil : $c[2]), cnt_max = ($c[3] == null ? nil : $c[3]), n_max = ($c[4] == null ? nil : $c[4]), success = ($c[5] == null ? nil : $c[5]), rerollCount = ($c[6] == null ? nil : $c[6]), $d;
        self.$debug("total, dice_str, numberSpot1, cnt_max, n_max, success, rerollCount", total, dice_str, numberSpot1, cnt_max, n_max, success, rerollCount);
        successCount = $rb_plus(successCount, success);
        round = $rb_plus(round, 1);
        dice_cnt_total = $rb_plus(dice_cnt_total, dice_cnt);
        dice_cnt = rerollCount;
        self.$debug("dice_str", dice_str);
        output = $rb_plus(output, " + " + (dice_str));
        if ((($c = ((($d = Opal.cvars['@@bcdice']) == null ? nil : $d).$isReRollAgain(dice_cnt, round)['$!']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          
          Opal.brk(nil, $brk)
          } else {
          return nil
        };}, TMP_6.$$s = self, TMP_6.$$brk = $brk, TMP_6.$$arity = 0, TMP_6), $a).call($b)
      } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
      self.$debug("output", output);
      self.$debug("rerollNumber End");
      return [output, round, successCount, dice_cnt_total];
    }, TMP_7.$$arity = 5);

    Opal.defn(self, '$getRerollNumber', TMP_8 = function $$getRerollNumber(rerollNumber_1, rerollNumber_2, judgeText, diff) {
      var $a, self = this;

      if ((($a = (rerollNumber_1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return rerollNumber_1.$to_i()
      } else if ((($a = (rerollNumber_2)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return rerollNumber_2.$to_i()
      } else if ((($a = (self.diceBot.$rerollNumber()['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.diceBot.$rerollNumber()
      } else if ((($a = (diff['$nil?']()['$!']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return diff
        } else {
        return self.$raiseErroForJudgeRule()
      };
    }, TMP_8.$$arity = 4);

    Opal.defn(self, '$raiseErroForJudgeRule', TMP_9 = function $$raiseErroForJudgeRule() {
      var self = this;

      return self.$raise("条件が間違っています。2R6>=5 あるいは 2R6[5] のように振り足し目標値を指定してください。");
    }, TMP_9.$$arity = 0);

    return (Opal.defn(self, '$checkReRollRule', TMP_10 = function $$checkReRollRule(dice_max, signOfInequality, diff) {
      var $a, $b, self = this, valid = nil, $case = nil;

      valid = true;
      $case = signOfInequality;if ("<="['$===']($case)) {if ((($a = ($rb_ge(diff, dice_max))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        valid = false}}else if (">="['$===']($case)) {if ((($a = ($rb_le(diff, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        valid = false}}else if ("<>"['$===']($case)) {if ((($a = (((($b = ($rb_gt(diff, dice_max))) !== false && $b !== nil && $b != null) ? $b : ($rb_lt(diff, 1))))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        valid = false}}else if ("<"['$===']($case)) {if ((($a = ($rb_gt(diff, dice_max))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        valid = false}}else if (">"['$===']($case)) {if ((($a = ($rb_lt(diff, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        valid = false}};
      if ((($a = (valid)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self.$raiseErroForJudgeRule()
      };
    }, TMP_10.$$arity = 3), nil) && 'checkReRollRule';
  })($scope.base, null)
};

/* Generated by Opal 0.10.5 */
Opal.modules["bcdiceCore"] = function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  var TMP_1, TMP_2, $a, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $hash2 = Opal.hash2, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$kconv', '$<', '$===', '$new', '$initValues', '$attr_accessor', '$attr_reader', '$setDiceBot', '$setBcDice', '$setDir', '$gameType', '$nil?', '$bcdice=', '$diceBot=', '$readExtraCard', '$first', '$split', '$debug', '$parren_killer', '$upcase', '$recieveMessageCatched', '$printErrorMessage', '$sendMessageToOnlySender', '$+', '$to_s', '$join', '$setTnick', '$match', '$setCommand', '$[]', '$executePointCounter', '$addPlot', '$clone', '$quit', '$checkMode', '$printHelp', '$printCardHelp', '$quitFunction', '$sleepForIrc', '$exit', '$call', '$quitFunction=', '$downcase', '$setMaster', '$setGame', '$setDisplayMode', '$setUpplerRollThreshold', '$setRerollLimit', '$setRatingTable', '$setSortMode', '$setCardMode', '$setSpellMode', '$setTapMode', '$readCardSet', '$!=', '$master', '$setMasterWhenMasterAlreadySet', '$setMasterWhenMasterYetSet', '$==', '$setMasterByCurrentMasterOwnself', '$master=', '$sendMessageToChannels', '$setGameByTitle', '$isMaster', '$=~', '$to_i', '$setSendMode', '$sendMode', '$upplerRollThreshold=', '$>', '$upplerRollThreshold', '$rerollLimitCount=', '$rerollLimitCount', '$setSortType', '$sortType', '$getPrintPlotChannel', '$empty?', '$executeCommand', '$countHolder', '$sendMessage', '$addToSecretDiceResult', '$getNick', '$lambda', '$each', '$to_proc', '$each_slice', '$lines', '$getHelpMessage', '$recievePublicMessageCatched', '$setChannelForPlotOrSecretDice', '$printPlot', '$printSecretRoll', '$executePointCounterPublic', '$executeDiceRoll', '$changeMessageOriginal', '$executeCard', '$openSecretRoll', '$setPrintPlotChannel', '$isTalkChannel', '$!', '$dice_command', '$broadmsg', '$setNick', '$rollD66', '$checkAddRoll', '$checkBDice', '$checkRnDice', '$checkUpperRoll', '$checkChoiceCommand', '$getTableDataResult', '$rollDice', '$bdice', '$dice_command_xRn', '$choice_random', '$getTableData', '$getTableIndexDiceValueAndDiceText', '$find', '$rollTableMessageDiceText', '$nick_e', '$roll', '$getD66Infos', '$getD66ValueByMarker', '$/', '$%', '$gsub', '$d66Type', '$isD9', '$<=', '$times', '$loop', '$>=', '$getJackUpValueOnAddRoll', '$rand', '$-', '$check_hit', '$push', '$sort_by', '$dice_num', '$randNomal', '$randFromRands', '$<<', '$shift', '$raise', '$inspect', '$sub', '$marshalSignOfInequality', '$defaultSuccessTarget', '$&', '$getGrichText', '$d66dice', '$getD66', '$getD66Value', '$*', '$getSecretRollMembersHolderKey', '$getSecretDiceResultHolderKey', '$delete', '$addToSecretRollMembersHolder', '$saveSecretDiceResult', '$[]=', '$include?', '$length', '$is_a?', '$getSuccessText', '$check_nDx', '$check_1D100', '$check_1D20', '$check_nD10', '$check_2D6', '$check_nD6', '$rollDiceAddingUp', '$changeRangeTextToNumberText', '$paren_k', '$changeText', '$split_plus_minus', '$paren_k_loop', '$scan', '$last', '$paren_k_calculate_multiple_divide_text', '$paren_k_multi', '$paren_k_devide', '$calculate_multiple_divide', '$fractionType', '$loadDiceBot', '$loadUnknownGame', '$postSet', '$gameName', '$sleep']);
  self.$require("log");
  self.$require("configBcDice.rb");
  self.$require("CountHolder.rb");
  self.$require("kconv");
  Opal.defn(Opal.Object, '$decode', TMP_1 = function $$decode(code, str) {
    var self = this;

    return str.$kconv(code);
  }, TMP_1.$$arity = 2);
  Opal.defn(Opal.Object, '$encode', TMP_2 = function $$encode(code, str) {
    var self = this;

    return $scope.get('Kconv').$kconv(str, code);
  }, TMP_2.$$arity = 2);
  $gvars.RUBY18_WIN = ($a = $rb_lt($scope.get('RUBY_VERSION'), "1.9"), $a !== false && $a !== nil && $a != null ?/mswin(?!ce)|mingw|cygwin|bccwin/i['$===']($scope.get('RUBY_PLATFORM')) : $a);
  $gvars.secretRollMembersHolder = $hash2([], {});
  $gvars.secretDiceResultHolder = $hash2([], {});
  $gvars.plotPrintChannels = $hash2([], {});
  $gvars.point_counter = $hash2([], {});
  self.$require("CardTrader");
  self.$require("TableFileData");
  self.$require("diceBot/DiceBot");
  self.$require("diceBot/DiceBotLoader");
  self.$require("diceBot/DiceBotLoaderList");
  self.$require("dice/AddDice");
  self.$require("dice/UpperDice");
  self.$require("dice/RerollDice");
  (function($base, $super) {
    function $BCDiceMaker(){};
    var self = $BCDiceMaker = $klass($base, $super, 'BCDiceMaker', $BCDiceMaker);

    var def = self.$$proto, $scope = self.$$scope, TMP_3, TMP_4;

    def.cardTrader = def.diceBot = def.counterInfos = def.tableFileData = nil;
    Opal.defn(self, '$initialize', TMP_3 = function $$initialize() {
      var self = this;

      self.diceBot = $scope.get('DiceBot').$new();
      self.cardTrader = $scope.get('CardTrader').$new();
      self.cardTrader.$initValues();
      self.counterInfos = $hash2([], {});
      self.tableFileData = $scope.get('TableFileData').$new();
      self.master = "";
      return self.quitFunction = nil;
    }, TMP_3.$$arity = 0);

    self.$attr_accessor("master");

    self.$attr_accessor("quitFunction");

    self.$attr_accessor("diceBot");

    self.$attr_accessor("diceBotPath");

    return (Opal.defn(self, '$newBcDice', TMP_4 = function $$newBcDice() {
      var self = this, bcdice = nil;

      bcdice = $scope.get('BCDice').$new(self, self.cardTrader, self.diceBot, self.counterInfos, self.tableFileData);
      return bcdice;
    }, TMP_4.$$arity = 0), nil) && 'newBcDice';
  })($scope.base, null);
  return (function($base, $super) {
    function $BCDice(){};
    var self = $BCDice = $klass($base, $super, 'BCDice', $BCDice);

    var def = self.$$proto, $scope = self.$$scope, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_32, TMP_33, TMP_34, TMP_35, TMP_36, TMP_37, TMP_38, TMP_39, TMP_42, TMP_43, TMP_44, TMP_45, TMP_47, TMP_48, TMP_49, TMP_51, TMP_52, TMP_53, TMP_54, TMP_55, TMP_56, TMP_57, TMP_58, TMP_59, TMP_60, TMP_61, TMP_63, TMP_64, TMP_66, TMP_70, TMP_71, TMP_72, TMP_73, TMP_74, TMP_75, TMP_76, TMP_77, TMP_79, TMP_80, TMP_81, TMP_83, TMP_84, TMP_85, TMP_86, TMP_87, TMP_89, TMP_90, TMP_91, TMP_92, TMP_93, TMP_94, TMP_95, TMP_96, TMP_97, TMP_98, TMP_99, TMP_100, TMP_101, TMP_102, TMP_103, TMP_104, TMP_105, TMP_106, TMP_107, TMP_109, TMP_110, TMP_111, TMP_113, TMP_115, TMP_116, TMP_117, TMP_118, TMP_119, TMP_120, TMP_121, TMP_122, TMP_123;

    def.cardTrader = def.tableFileData = def.diceBot = def.parent = def.messageOriginal = def.message = def.nick_e = def.tnick = def.ircClient = def.isShortSpell = def.canTapCard = def.messages = def.channel = def.isMessagePrinted = def.counterInfos = def.isTest = def.isKeepSecretDice = def.rands = def.randResults = def.isIrcMode = nil;
    Opal.cdecl($scope, 'SET_COMMAND_PATTERN', /\Aset\s+(.+)/i);

    self.$attr_reader("cardTrader");

    Opal.defn(self, '$initialize', TMP_5 = function $$initialize(parent, cardTrader, diceBot, counterInfos, tableFileData) {
      var self = this;

      self.parent = parent;
      self.$setDiceBot(diceBot);
      self.cardTrader = cardTrader;
      self.cardTrader.$setBcDice(self);
      self.counterInfos = counterInfos;
      self.tableFileData = tableFileData;
      self.nick_e = "";
      self.tnick = "";
      self.isMessagePrinted = false;
      self.rands = nil;
      self.isKeepSecretDice = true;
      self.randResults = nil;
      return self.isIrcMode = true;
    }, TMP_5.$$arity = 5);

    Opal.defn(self, '$setDir', TMP_6 = function $$setDir(dir, prefix) {
      var self = this;

      return self.tableFileData.$setDir(dir, prefix);
    }, TMP_6.$$arity = 2);

    Opal.defn(self, '$isKeepSecretDice', TMP_7 = function $$isKeepSecretDice(b) {
      var self = this;

      return self.isKeepSecretDice = b;
    }, TMP_7.$$arity = 1);

    Opal.defn(self, '$getGameType', TMP_8 = function $$getGameType() {
      var self = this;

      return self.diceBot.$gameType();
    }, TMP_8.$$arity = 0);

    Opal.defn(self, '$setDiceBot', TMP_9 = function $$setDiceBot(diceBot) {
      var $a, $b, self = this;

      if ((($a = (diceBot['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.diceBot = diceBot;
      (($a = [self]), $b = self.diceBot, $b['$bcdice='].apply($b, $a), $a[$a.length-1]);
      return (($a = [self.diceBot]), $b = self.parent, $b['$diceBot='].apply($b, $a), $a[$a.length-1]);
    }, TMP_9.$$arity = 1);

    self.$attr_reader("nick_e");

    Opal.defn(self, '$readExtraCard', TMP_10 = function $$readExtraCard(cardFileName) {
      var self = this;

      return self.cardTrader.$readExtraCard(cardFileName);
    }, TMP_10.$$arity = 1);

    Opal.defn(self, '$setIrcClient', TMP_11 = function $$setIrcClient(client) {
      var self = this;

      return self.ircClient = client;
    }, TMP_11.$$arity = 1);

    Opal.defn(self, '$setMessage', TMP_12 = function $$setMessage(message) {
      var self = this, pattern = nil, openPattern = nil, messageToSet = nil, $case = nil;
      if ($gvars.OPEN_DICE == null) $gvars.OPEN_DICE = nil;
      if ($gvars.OPEN_PLOT == null) $gvars.OPEN_PLOT = nil;

      pattern = "\\A\\s*(?:" + ($gvars.OPEN_DICE) + "|" + ($gvars.OPEN_PLOT) + ")\\s*\\z";
      openPattern = $scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')));
      messageToSet = (function() {$case = message;if (openPattern['$===']($case) || $scope.get('SET_COMMAND_PATTERN')['$===']($case)) {return message}else {return message.$split(/\s/, 2).$first()}})();
      self.$debug("setMessage messageToSet", messageToSet);
      self.messageOriginal = self.$parren_killer(messageToSet);
      self.message = self.messageOriginal.$upcase();
      return self.$debug("@message", self.message);
    }, TMP_12.$$arity = 1);

    Opal.defn(self, '$getOriginalMessage', TMP_13 = function $$getOriginalMessage() {
      var self = this;

      return self.messageOriginal;
    }, TMP_13.$$arity = 0);

    Opal.defn(self, '$changeMessageOriginal', TMP_14 = function $$changeMessageOriginal() {
      var self = this;

      return self.message = self.messageOriginal;
    }, TMP_14.$$arity = 0);

    Opal.defn(self, '$recieveMessage', TMP_15 = function $$recieveMessage(nick_e, tnick) {
      var self = this, e = nil;

      try {
        return self.$recieveMessageCatched(nick_e, tnick)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            return self.$printErrorMessage(e)
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_15.$$arity = 2);

    Opal.defn(self, '$printErrorMessage', TMP_16 = function $$printErrorMessage(e) {
      var self = this;
      if ($gvars["@"] == null) $gvars["@"] = nil;

      return self.$sendMessageToOnlySender($rb_plus($rb_plus("error ", e.$to_s()), $gvars["@"].$join("\n")));
    }, TMP_16.$$arity = 1);

    Opal.defn(self, '$recieveMessageCatched', TMP_17 = function $$recieveMessageCatched(nick_e, tnick) {
      var self = this, setMatches = nil, $case = nil;
      if ($gvars.quitCommand == null) $gvars.quitCommand = nil;

      self.$debug("recieveMessage nick_e, tnick", nick_e, tnick);
      self.nick_e = nick_e;
      self.cardTrader.$setTnick(self.nick_e);
      self.tnick = tnick;
      self.cardTrader.$setTnick(self.tnick);
      self.$debug("@nick_e, @tnick", self.nick_e, self.tnick);
      setMatches = self.message.$match($scope.get('SET_COMMAND_PATTERN'));
      if (setMatches !== false && setMatches !== nil && setMatches != null) {
        self.$setCommand(setMatches['$[]'](1));
        return nil;};
      self.$executePointCounter();
      self.$addPlot(self.messageOriginal.$clone());
      return (function() {$case = self.message;if ($gvars.quitCommand['$===']($case)) {return self.$quit()}else if (/^mode$/i['$===']($case)) {return self.$checkMode()}else if (/^help$/i['$===']($case)) {return self.$printHelp()}else if (/^c-help$/i['$===']($case)) {return self.cardTrader.$printCardHelp()}else { return nil }})();
    }, TMP_17.$$arity = 2);

    Opal.defn(self, '$quit', TMP_18 = function $$quit() {
      var $a, self = this;

      self.ircClient.$quit();
      if ((($a = (self.parent.$quitFunction()['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sleepForIrc(3);
        return self.$exit(0);
        } else {
        return self.parent.$quitFunction().$call()
      };
    }, TMP_18.$$arity = 0);

    Opal.defn(self, '$setQuitFuction', TMP_19 = function $$setQuitFuction(func) {
      var $a, $b, self = this;

      return (($a = [func]), $b = self.parent, $b['$quitFunction='].apply($b, $a), $a[$a.length-1]);
    }, TMP_19.$$arity = 1);

    Opal.defn(self, '$setCommand', TMP_20 = function $$setCommand(arg) {
      var self = this, $case = nil;

      self.$debug("setCommand arg", arg);
      return (function() {$case = arg.$downcase();if ("master"['$===']($case)) {return self.$setMaster()}else if ("game"['$===']($case)) {return self.$setGame()}else if (/\Av(?:iew\s*)?mode\z/['$===']($case)) {return self.$setDisplayMode()}else if ("upper"['$===']($case)) {return self.$setUpplerRollThreshold()}else if ("reroll"['$===']($case)) {return self.$setRerollLimit()}else if (/\Ar(?:ating\s*)?t(?:able)?\z/['$===']($case)) {return self.$setRatingTable()}else if ("sort"['$===']($case)) {return self.$setSortMode()}else if ("cardplace"['$===']($case) || "cp"['$===']($case)) {return self.$setCardMode()}else if ("shortspell"['$===']($case) || "ss"['$===']($case)) {return self.$setSpellMode()}else if ("tap"['$===']($case)) {return self.$setTapMode()}else if ("cardset"['$===']($case) || "cs"['$===']($case)) {return self.$readCardSet()}else { return nil }})();
    }, TMP_20.$$arity = 1);

    Opal.defn(self, '$setMaster', TMP_21 = function $$setMaster() {
      var $a, self = this;

      if ((($a = (self.parent.$master()['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$setMasterWhenMasterAlreadySet()
        } else {
        return self.$setMasterWhenMasterYetSet()
      };
    }, TMP_21.$$arity = 0);

    Opal.defn(self, '$setMasterWhenMasterAlreadySet', TMP_22 = function $$setMasterWhenMasterAlreadySet() {
      var $a, self = this;

      if ((($a = (self.nick_e['$=='](self.parent.$master()))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$setMasterByCurrentMasterOwnself()
        } else {
        return self.$sendMessageToOnlySender("Masterは" + (self.parent.$master()) + "さんになっています")
      };
    }, TMP_22.$$arity = 0);

    Opal.defn(self, '$setMasterByCurrentMasterOwnself', TMP_23 = function $$setMasterByCurrentMasterOwnself() {
      var $a, $b, self = this;

      if ((($a = (self.tnick['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (($a = [self.tnick]), $b = self.parent, $b['$master='].apply($b, $a), $a[$a.length-1]);
        return self.$sendMessageToChannels("" + (self.parent.$master()) + "さんをMasterに設定しました");
        } else {
        (($a = [""]), $b = self.parent, $b['$master='].apply($b, $a), $a[$a.length-1]);
        return self.$sendMessageToChannels("Master設定を解除しました");
      };
    }, TMP_23.$$arity = 0);

    Opal.defn(self, '$setMasterWhenMasterYetSet', TMP_24 = function $$setMasterWhenMasterYetSet() {
      var $a, $b, self = this;

      if ((($a = (self.tnick['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (($a = [self.tnick]), $b = self.parent, $b['$master='].apply($b, $a), $a[$a.length-1])
        } else {
        (($a = [self.nick_e]), $b = self.parent, $b['$master='].apply($b, $a), $a[$a.length-1])
      };
      return self.$sendMessageToChannels("" + (self.parent.$master()) + "さんをMasterに設定しました");
    }, TMP_24.$$arity = 0);

    Opal.defn(self, '$setGame', TMP_25 = function $$setGame() {
      var self = this, messages = nil;

      messages = self.$setGameByTitle(self.tnick);
      return self.$sendMessageToChannels(messages);
    }, TMP_25.$$arity = 0);

    Opal.defn(self, '$isMaster', TMP_26 = function $$isMaster() {
      var $a, self = this;

      return (((($a = (self.nick_e['$=='](self.parent.$master()))) !== false && $a !== nil && $a != null) ? $a : (self.parent.$master()['$=='](""))));
    }, TMP_26.$$arity = 0);

    Opal.defn(self, '$setDisplayMode', TMP_27 = function $$setDisplayMode() {
      var $a, self = this, mode = nil;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      mode = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
      self.diceBot.$setSendMode(mode);
      return self.$sendMessageToChannels("ViewMode" + (self.diceBot.$sendMode()) + "に変更しました");
    }, TMP_27.$$arity = 0);

    Opal.defn(self, '$setUpplerRollThreshold', TMP_28 = function $$setUpplerRollThreshold() {
      var $a, $b, $c, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      (($a = [(($c = $gvars['~']) === nil ? nil : $c['$[]'](1)).$to_i()]), $b = self.diceBot, $b['$upplerRollThreshold='].apply($b, $a), $a[$a.length-1]);
      if ((($a = ($rb_gt(self.diceBot.$upplerRollThreshold(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("上方無限ロールを" + (self.diceBot.$upplerRollThreshold()) + "以上に設定しました")
        } else {
        return self.$sendMessageToChannels("上方無限ロールの閾値設定を解除しました")
      };
    }, TMP_28.$$arity = 0);

    Opal.defn(self, '$setRerollLimit', TMP_29 = function $$setRerollLimit() {
      var $a, $b, $c, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      (($a = [(($c = $gvars['~']) === nil ? nil : $c['$[]'](1)).$to_i()]), $b = self.diceBot, $b['$rerollLimitCount='].apply($b, $a), $a[$a.length-1]);
      if ((($a = ($rb_gt(self.diceBot.$rerollLimitCount(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("個数振り足しロール回数を" + (self.diceBot.$rerollLimitCount()) + "以下に設定しました")
        } else {
        return self.$sendMessageToChannels("個数振り足しロールの回数を無限に設定しました")
      };
    }, TMP_29.$$arity = 0);

    Opal.defn(self, '$setRatingTable', TMP_30 = function $$setRatingTable() {
      var $a, self = this, output = nil;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      output = self.diceBot.$setRatingTable(self.tnick);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      return self.$sendMessageToChannels(output);
    }, TMP_30.$$arity = 0);

    Opal.defn(self, '$setSortMode', TMP_31 = function $$setSortMode() {
      var $a, self = this, sortType = nil;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      sortType = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i();
      self.diceBot.$setSortType(sortType);
      if ((($a = (self.diceBot.$sortType()['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("ソート有りに変更しました")
        } else {
        return self.$sendMessageToChannels("ソート無しに変更しました")
      };
    }, TMP_31.$$arity = 0);

    Opal.defn(self, '$setCardMode', TMP_32 = function $$setCardMode() {
      var $a, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      return self.cardTrader.$setCardMode();
    }, TMP_32.$$arity = 0);

    Opal.defn(self, '$setSpellMode', TMP_33 = function $$setSpellMode() {
      var $a, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      self.isShortSpell = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i()['$!='](0));
      if ((($a = (self.isShortSpell)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("短い呪文モードに変更しました")
        } else {
        return self.$sendMessageToChannels("通常呪文モードに変更しました")
      };
    }, TMP_33.$$arity = 0);

    Opal.defn(self, '$setTapMode', TMP_34 = function $$setTapMode() {
      var $a, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (/(\d+)/['$=~'](self.tnick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      self.canTapCard = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i()['$!='](0));
      if ((($a = (self.canTapCard)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToChannels("タップ可能モードに変更しました")
        } else {
        return self.$sendMessageToChannels("タップ不可モードに変更しました")
      };
    }, TMP_34.$$arity = 0);

    Opal.defn(self, '$readCardSet', TMP_35 = function $$readCardSet() {
      var $a, self = this;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      return self.cardTrader.$readCardSet();
    }, TMP_35.$$arity = 0);

    Opal.defn(self, '$executePointCounter', TMP_36 = function $$executePointCounter() {
      var $a, $b, self = this, arg = nil, channel = nil, pointerMode = nil, output = nil, $case = nil;

      arg = self.messages;
      self.$debug("executePointCounter arg", arg);
      if ((($a = (arg['$=~'](/^#/))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("executePointCounter is NOT matched");
        return nil;
      };
      channel = self.$getPrintPlotChannel(self.nick_e);
      self.$debug("getPrintPlotChannel get channel", channel);
      if ((($a = (channel['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$sendMessageToOnlySender("表示チャンネルが登録されていません");
        return nil;};
      if ((($a = (self.tnick['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        arg = $rb_plus(arg, "->" + (self.tnick))
      };
      pointerMode = "sameNick";
      $b = self.$countHolder().$executeCommand(arg, self.nick_e, channel, pointerMode), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), pointerMode = ($a[1] == null ? nil : $a[1]), $b;
      self.$debug("point_counter_command called, line", 473);
      self.$debug("output", output);
      self.$debug("pointerMode", pointerMode);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("executePointCounter point_counter_command output is \"1\"");
        return nil;};
      $case = pointerMode;if ("sameNick"['$===']($case)) {self.$debug("executePointCounter:Talkで返事");
      self.$sendMessageToOnlySender(output);}else if ("sameChannel"['$===']($case)) {self.$debug("executePointCounter:publicで返事");
      self.$sendMessage(channel, output);};
      return self.$debug("executePointCounter end");
    }, TMP_36.$$arity = 0);

    Opal.defn(self, '$addPlot', TMP_37 = function $$addPlot(arg) {
      var $a, self = this, pattern = nil, plot = nil, channel = nil;
      if ($gvars.ADD_PLOT == null) $gvars.ADD_PLOT = nil;

      self.$debug("addPlot begin arg", arg);
      pattern = "" + ($gvars.ADD_PLOT) + "[:：](.+)";
      if ((($a = ($scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')))['$=~'](arg))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("addPlot exit");
        return nil;
      };
      plot = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      channel = self.$getPrintPlotChannel(self.nick_e);
      self.$debug("addPlot channel", channel);
      if ((($a = (channel['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("channel.nil?");
        return self.$sendMessageToOnlySender("プロット出力先が登録されていません");
        } else {
        self.$debug("addToSecretDiceResult calling...");
        self.$addToSecretDiceResult(plot, channel, 1);
        return self.$sendMessage(channel, "" + (self.nick_e) + " さんがプロットしました");
      };
    }, TMP_37.$$arity = 1);

    Opal.defn(self, '$getPrintPlotChannel', TMP_38 = function $$getPrintPlotChannel(nick) {
      var self = this;
      if ($gvars.plotPrintChannels == null) $gvars.plotPrintChannels = nil;

      nick = self.$getNick(nick);
      return $gvars.plotPrintChannels['$[]'](nick);
    }, TMP_38.$$arity = 1);

    Opal.defn(self, '$checkMode', TMP_39 = function $$checkMode() {
      var $a, self = this, output = nil;

      if ((($a = (self.$isMaster())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      output = $rb_plus($rb_plus($rb_plus($rb_plus($rb_plus("GameType = ", self.diceBot.$gameType()), ", ViewMode = "), self.diceBot.$sendMode()), ", Sort = "), self.diceBot.$sortType());
      return self.$sendMessageToOnlySender(output);
    }, TMP_39.$$arity = 0);

    Opal.defn(self, '$printHelp', TMP_42 = function $$printHelp() {
      var $a, $b, TMP_40, $c, $d, TMP_41, $e, $f, $g, self = this, send_to_sender = nil;
      if ($gvars.OPEN_DICE == null) $gvars.OPEN_DICE = nil;
      if ($gvars.OPEN_PLOT == null) $gvars.OPEN_PLOT = nil;
      if ($gvars.ADD_PLOT == null) $gvars.ADD_PLOT = nil;
      if ($gvars.READY_CMD == null) $gvars.READY_CMD = nil;

      send_to_sender = ($a = ($b = self).$lambda, $a.$$p = (TMP_40 = function(message){var self = TMP_40.$$s || this;
if (message == null) message = nil;
      return self.$sendMessageToOnlySender(message)}, TMP_40.$$s = self, TMP_40.$$arity = 1, TMP_40), $a).call($b);
      ($a = ($c = ["・加算ロール　　　　　　　　(xDn) (n面体ダイスをx個)", "・バラバラロール　　　　　　(xBn)", "・個数振り足しロール　　　　(xRn[振り足し値])", "・上方無限ロール　　　　　　(xUn[境界値])", "・シークレットロール　　　　(Sダイスコマンド)", "・シークレットをオープンする(" + ($gvars.OPEN_DICE) + ")", "・四則計算(端数切捨て)　　　(C(式))"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($c);
      self.$sleepForIrc(2);
      ($a = ($d = self.diceBot.$getHelpMessage().$lines()).$each_slice, $a.$$p = (TMP_41 = function(lines){var self = TMP_41.$$s || this, $e, $f;
if (lines == null) lines = nil;
      ($e = ($f = lines).$each, $e.$$p = send_to_sender.$to_proc(), $e).call($f);
        return self.$sleepForIrc(1);}, TMP_41.$$s = self, TMP_41.$$arity = 1, TMP_41), $a).call($d, 5);
      self.$sendMessageToOnlySender("  ---");
      self.$sleepForIrc(1);
      ($a = ($e = ["・プロット表示　　　　　　　　(" + ($gvars.OPEN_PLOT) + ")", "・プロット記録　　　　　　　　(Talkで " + ($gvars.ADD_PLOT) + ":プロット)", "  ---"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($e);
      self.$sleepForIrc(2);
      ($a = ($f = ["・ポイントカウンタ値登録　　　(#[名前:]タグn[/m]) (識別名、最大値省略可,Talk可)", "・カウンタ値操作　　　　　　　(#[名前:]タグ+n) (もちろん-nもOK,Talk可)", "・識別名変更　　　　　　　　　(#RENAME!名前1->名前2) (Talk可)"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($f);
      self.$sleepForIrc(1);
      ($a = ($g = ["・同一タグのカウンタ値一覧　　(#OPEN!タグ)", "・自キャラのカウンタ値一覧　　(Talkで#OPEN![タグ]) (全カウンタ表示時、タグ省略)", "・自キャラのカウンタ削除　　　(#[名前:]DIED!) (デフォルト時、識別名省略)", "・全自キャラのカウンタ削除　　(#ALL!:DIED!)", "・カウンタ表示チャンネル登録　(" + ($gvars.READY_CMD) + ")", "  ---"]).$each, $a.$$p = send_to_sender.$to_proc(), $a).call($g);
      self.$sleepForIrc(2);
      self.$sendMessageToOnlySender("・カード機能ヘルプ　　　　　　(c-help)");
      return self.$sendMessageToOnlySender("  -- END ---");
    }, TMP_42.$$arity = 0);

    Opal.defn(self, '$setChannel', TMP_43 = function $$setChannel(channel) {
      var self = this;

      self.$debug("setChannel called channel", channel);
      return self.channel = channel;
    }, TMP_43.$$arity = 1);

    Opal.defn(self, '$recievePublicMessage', TMP_44 = function $$recievePublicMessage(nick_e) {
      var self = this, e = nil;

      try {
        return self.$recievePublicMessageCatched(nick_e)
      } catch ($err) {
        if (Opal.rescue($err, [$scope.get('StandardError')])) {e = $err;
          try {
            return self.$printErrorMessage(e)
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_44.$$arity = 1);

    Opal.defn(self, '$recievePublicMessageCatched', TMP_45 = function $$recievePublicMessageCatched(nick_e) {
      var $a, self = this, mynick = nil, secret = nil, pattern = nil, output = nil;
      if ($gvars.OPEN_PLOT == null) $gvars.OPEN_PLOT = nil;
      if ($gvars.OPEN_DICE == null) $gvars.OPEN_DICE = nil;

      self.$debug("recievePublicMessageCatched begin nick_e", nick_e);
      self.$debug("recievePublicMessageCatched @channel", self.channel);
      self.$debug("recievePublicMessageCatched @message", self.message);
      self.nick_e = nick_e;
      mynick = "";
      secret = false;
      self.$setChannelForPlotOrSecretDice();
      pattern = "(^|\\s+)" + ($gvars.OPEN_PLOT) + "(\\s+|$)";
      if ((($a = ($scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')))['$=~'](self.message))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("print plot", self.message);
        self.$printPlot();};
      pattern = "(^|\\s+)" + ($gvars.OPEN_DICE) + "(\\s+|$)";
      if ((($a = ($scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')))['$=~'](self.message))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("print secret roll", self.message);
        self.$printSecretRoll();};
      self.$executePointCounterPublic();
      self.$executeDiceRoll();
      if ((($a = (/(^|\s)C([-\d]+)\s*$/i['$=~'](self.message))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
        if ((($a = (output['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$sendMessage(self.channel, "" + (self.nick_e) + ": 計算結果 ＞ " + (output))};};
      self.$changeMessageOriginal();
      self.$executeCard();
      if ((($a = (self.isMessagePrinted)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {};
      return self.$debug("\non_public end");
    }, TMP_45.$$arity = 1);

    Opal.defn(self, '$printPlot', TMP_47 = function $$printPlot() {
      var $a, $b, TMP_46, self = this, messageList = nil;

      self.$debug("printPlot begin");
      messageList = self.$openSecretRoll(self.channel, 1);
      self.$debug("messageList", messageList);
      return ($a = ($b = messageList).$each, $a.$$p = (TMP_46 = function(message){var self = TMP_46.$$s || this, $c;
        if (self.channel == null) self.channel = nil;
if (message == null) message = nil;
      if ((($c = (message['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          self.$debug("message is empty");
          return self.$setPrintPlotChannel();
          } else {
          self.$debug("message", message);
          self.$sendMessage(self.channel, message);
          return self.$sleepForIrc(1);
        }}, TMP_46.$$s = self, TMP_46.$$arity = 1, TMP_46), $a).call($b);
    }, TMP_47.$$arity = 0);

    Opal.defn(self, '$setChannelForPlotOrSecretDice', TMP_48 = function $$setChannelForPlotOrSecretDice() {
      var $a, self = this, channel = nil;

      self.$debug("setChannelForPlotOrSecretDice Begin");
      if ((($a = (self.$isTalkChannel())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      channel = self.$getPrintPlotChannel(self.nick_e);
      if ((($a = (channel['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$setPrintPlotChannel()
        } else {
        return nil
      };
    }, TMP_48.$$arity = 0);

    Opal.defn(self, '$isTalkChannel', TMP_49 = function $$isTalkChannel() {
      var self = this;

      return ((/^#/['$==='](self.channel))['$!']());
    }, TMP_49.$$arity = 0);

    Opal.defn(self, '$printSecretRoll', TMP_51 = function $$printSecretRoll() {
      var $a, $b, TMP_50, self = this, outputs = nil;

      outputs = self.$openSecretRoll(self.channel, 0);
      return ($a = ($b = outputs).$each, $a.$$p = (TMP_50 = function(diceResult){var self = TMP_50.$$s || this, $c;
        if (self.channel == null) self.channel = nil;
if (diceResult == null) diceResult = nil;
      if ((($c = (diceResult['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return nil;};
        self.$sendMessage(self.channel, diceResult);
        return self.$sleepForIrc(1);}, TMP_50.$$s = self, TMP_50.$$arity = 1, TMP_50), $a).call($b);
    }, TMP_51.$$arity = 0);

    Opal.defn(self, '$executePointCounterPublic', TMP_52 = function $$executePointCounterPublic() {
      var $a, $b, self = this, pattern = nil, pointerMode = nil, countHolder = nil, output = nil, secret = nil;
      if ($gvars.READY_CMD == null) $gvars.READY_CMD = nil;

      self.$debug("executePointCounterPublic begin");
      pattern = "^" + ($gvars.READY_CMD) + "(\\s+|$)";
      if ((($a = ($scope.get('Regexp').$new(pattern, (($scope.get('Regexp')).$$scope.get('IGNORECASE')))['$=~'](self.message))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$setPrintPlotChannel();
        self.$sendMessageToOnlySender("表示チャンネルを設定しました");
        return nil;};
      if ((($a = (/^#/['$=~'](self.message))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("executePointCounterPublic NOT match");
        return nil;
      };
      pointerMode = "sameChannel";
      countHolder = $scope.get('CountHolder').$new(self, self.counterInfos);
      $b = countHolder.$executeCommand(self.message, self.nick_e, self.channel, pointerMode), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      self.$debug("executePointCounterPublic output, secret", output, secret);
      if ((($a = (secret)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("is secret");
        if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$sendMessageToOnlySender(output)
          } else {
          return nil
        };
        } else {
        self.$debug("is NOT secret");
        if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$sendMessage(self.channel, output)
          } else {
          return nil
        };
      };
    }, TMP_52.$$arity = 0);

    Opal.defn(self, '$executeDiceRoll', TMP_53 = function $$executeDiceRoll() {
      var $a, $b, self = this, output = nil, secret = nil;

      self.$debug("executeDiceRoll begin");
      self.$debug("channel", self.channel);
      $b = self.$dice_command(), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (secret)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$debug("executeDiceRoll @channel", self.channel);
        if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$sendMessage(self.channel, output)};
        return nil;
      };
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (self.isTest)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(output, "###secret dice###")};
      self.$broadmsg(output, self.nick_e);
      if ((($a = (self.isKeepSecretDice)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$addToSecretDiceResult(output, self.channel, 0)
        } else {
        return nil
      };
    }, TMP_53.$$arity = 0);

    Opal.defn(self, '$setTest', TMP_54 = function $$setTest(isTest) {
      var self = this;

      return self.isTest = isTest;
    }, TMP_54.$$arity = 1);

    Opal.defn(self, '$executeCard', TMP_55 = function $$executeCard() {
      var self = this;

      self.$debug("executeCard begin");
      self.cardTrader.$setNick(self.nick_e);
      self.cardTrader.$setTnick(self.tnick);
      self.cardTrader.$executeCard(self.message, self.channel);
      return self.$debug("executeCard end");
    }, TMP_55.$$arity = 0);

    Opal.defn(self, '$dice_command', TMP_56 = function $$dice_command() {
      var $a, $b, self = this, arg = nil, output = nil, secret = nil;

      arg = self.message.$upcase();
      self.$debug("dice_command arg", arg);
      $b = self.diceBot.$dice_command(self.message, self.nick_e), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$!=']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [output, secret]};
      $b = self.$rollD66(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$checkAddRoll(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$checkBDice(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$checkRnDice(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$checkUpperRoll(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$checkChoiceCommand(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      $b = self.$getTableDataResult(arg), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (output['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [output, secret]
      };
      output = "1";
      secret = false;
      return [output, secret];
    }, TMP_56.$$arity = 0);

    Opal.defn(self, '$checkAddRoll', TMP_57 = function $$checkAddRoll(arg) {
      var $a, self = this, dice = nil, output = nil, secret = nil;

      self.$debug("check add roll");
      dice = $scope.get('AddDice').$new(self, self.diceBot);
      output = dice.$rollDice(arg);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      secret = (/S[-\d]+D[\d+-]+/['$==='](arg));
      return [output, secret];
    }, TMP_57.$$arity = 1);

    Opal.defn(self, '$checkBDice', TMP_58 = function $$checkBDice(arg) {
      var $a, self = this, output = nil, secret = nil;

      self.$debug("check barabara roll");
      output = self.$bdice(arg);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      secret = (/S[\d]+B[\d]+/i['$==='](arg));
      return [output, secret];
    }, TMP_58.$$arity = 1);

    Opal.defn(self, '$checkRnDice', TMP_59 = function $$checkRnDice(arg) {
      var $a, $b, self = this, secret = nil, output = nil, dice = nil;

      self.$debug("check xRn roll arg", arg);
      if ((($a = (/(S)?[\d]+R[\d]+/i['$==='](arg))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      secret = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](1))['$nil?']()['$!']());
      output = self.diceBot.$dice_command_xRn(arg, self.nick_e);
      if ((($a = (((($b = output['$nil?']()) !== false && $b !== nil && $b != null) ? $b : output['$==']("1")))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (output['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        dice = $scope.get('RerollDice').$new(self, self.diceBot);
        output = dice.$rollDice(arg);};
      if ((($a = (((($b = output['$nil?']()) !== false && $b !== nil && $b != null) ? $b : output['$==']("1")))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.$debug("xRn output", output);
      return [output, secret];
    }, TMP_59.$$arity = 1);

    Opal.defn(self, '$checkUpperRoll', TMP_60 = function $$checkUpperRoll(arg) {
      var $a, self = this, secret = nil, dice = nil, output = nil;

      self.$debug("check upper roll");
      if ((($a = (/(S)?[\d]+U[\d]+/i['$==='](arg))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      secret = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](1))['$nil?']()['$!']());
      dice = $scope.get('UpperDice').$new(self, self.diceBot);
      output = dice.$rollDice(arg);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      return [output, secret];
    }, TMP_60.$$arity = 1);

    Opal.defn(self, '$checkChoiceCommand', TMP_61 = function $$checkChoiceCommand(arg) {
      var $a, self = this, secret = nil, output = nil;

      self.$debug("check choice command");
      if ((($a = (/((^|\s)(S)?choice\[[^,]+(,[^,]+)+\]($|\s))/i['$==='](arg))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      secret = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](3))['$nil?']()['$!']());
      output = self.$choice_random((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)));
      return [output, secret];
    }, TMP_61.$$arity = 1);

    Opal.defn(self, '$getTableDataResult', TMP_63 = function $$getTableDataResult(arg) {
      var $a, $b, $c, $d, TMP_62, self = this, dice = nil, title = nil, table = nil, secret = nil, value = nil, diceText = nil, key = nil, message = nil, output = nil;

      self.$debug("getTableDataResult Begin");
      $b = self.tableFileData.$getTableData(arg, self.diceBot.$gameType()), $a = Opal.to_ary($b), dice = ($a[0] == null ? nil : $a[0]), title = ($a[1] == null ? nil : $a[1]), table = ($a[2] == null ? nil : $a[2]), secret = ($a[3] == null ? nil : $a[3]), $b;
      self.$debug("dice", dice);
      if ((($a = (table['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("table is null");
        return nil;};
      $b = self.$getTableIndexDiceValueAndDiceText(dice), $a = Opal.to_ary($b), value = ($a[0] == null ? nil : $a[0]), diceText = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (value['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.$debug("value", value);
      $b = ($c = ($d = table).$find, $c.$$p = (TMP_62 = function(i){var self = TMP_62.$$s || this;
if (i == null) i = nil;
      return i.$first()['$==='](value)}, TMP_62.$$s = self, TMP_62.$$arity = 1, TMP_62), $c).call($d), $a = Opal.to_ary($b), key = ($a[0] == null ? nil : $a[0]), message = ($a[1] == null ? nil : $a[1]), $b;
      if ((($a = (message['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      message = self.$rollTableMessageDiceText(message);
      output = "" + (self.$nick_e()) + ":" + (title) + "(" + (value) + "[" + (diceText) + "]) ＞ " + (message);
      return [output, secret];
    }, TMP_63.$$arity = 1);

    Opal.defn(self, '$getTableIndexDiceValueAndDiceText', TMP_64 = function $$getTableIndexDiceValueAndDiceText(dice) {
      var $a, $b, self = this, diceCount = nil, diceType = nil, value = nil, diceText = nil, string = nil, secret = nil, count = nil, swapMarker = nil;

      if ((($a = (/(\d+)D(\d+)/i['$==='](dice))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diceCount = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
        diceType = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
        $b = self.$roll(diceCount, diceType), $a = Opal.to_ary($b), value = ($a[0] == null ? nil : $a[0]), diceText = ($a[1] == null ? nil : $a[1]), $b;
        return [value, diceText];};
      $b = self.$getD66Infos(dice), $a = Opal.to_ary($b), string = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), count = ($a[2] == null ? nil : $a[2]), swapMarker = ($a[3] == null ? nil : $a[3]), $b;
      if ((($a = (string['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        value = self.$getD66ValueByMarker(swapMarker);
        diceText = $rb_plus($rb_plus(($rb_divide(value, 10)).$to_s(), ","), (value['$%'](10)).$to_s());
        return [value, diceText];
      };
      return nil;
    }, TMP_64.$$arity = 1);

    Opal.defn(self, '$rollTableMessageDiceText', TMP_66 = function $$rollTableMessageDiceText(text) {
      var $a, $b, TMP_65, self = this, message = nil;

      message = ($a = ($b = text).$gsub, $a.$$p = (TMP_65 = function(){var self = TMP_65.$$s || this, $c, $d, diceCount = nil, diceMax = nil, reg1 = nil, reg2 = nil, value = nil;

      diceCount = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1));
        diceMax = (($c = $gvars['~']) === nil ? nil : $c['$[]'](2));
        reg1 = (($c = $gvars['~']) === nil ? nil : $c['$[]'](1));
        reg2 = (($c = $gvars['~']) === nil ? nil : $c['$[]'](2));
        $d = self.$roll(diceCount, diceMax), $c = Opal.to_ary($d), value = ($c[0] == null ? nil : $c[0]), $d;
        return "" + (reg1) + "D" + (reg2) + "(=>" + (value) + ")";}, TMP_65.$$s = self, TMP_65.$$arity = 0, TMP_65), $a).call($b, /(\d+)D(\d+)/);
      return message;
    }, TMP_66.$$arity = 1);

    Opal.defn(self, '$roll', TMP_70 = function $$roll(dice_cnt, dice_max, dice_sort, dice_add, dice_ul, dice_diff, dice_re) {
      var $a, $b, TMP_67, $c, TMP_69, self = this, total = nil, dice_str = nil, numberSpot1 = nil, cnt_max = nil, n_max = nil, cnt_suc = nil, d9_on = nil, rerollCount = nil, dice_result = nil;
      if ($gvars.DICE_MAXCNT == null) $gvars.DICE_MAXCNT = nil;
      if ($gvars.DICE_MAXNUM == null) $gvars.DICE_MAXNUM = nil;

      if (dice_sort == null) {
        dice_sort = 0;
      }
      if (dice_add == null) {
        dice_add = 0;
      }
      if (dice_ul == null) {
        dice_ul = "";
      }
      if (dice_diff == null) {
        dice_diff = 0;
      }
      if (dice_re == null) {
        dice_re = nil;
      }
      dice_cnt = dice_cnt.$to_i();
      dice_max = dice_max.$to_i();
      dice_re = dice_re.$to_i();
      total = 0;
      dice_str = "";
      numberSpot1 = 0;
      cnt_max = 0;
      n_max = 0;
      cnt_suc = 0;
      d9_on = false;
      rerollCount = 0;
      dice_result = [];
      if ((($a = (($b = (self.diceBot.$d66Type()['$!='](0)), $b !== false && $b !== nil && $b != null ?(dice_max['$=='](66)) : $b))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        dice_sort = 0;
        dice_cnt = 2;
        dice_max = 6;};
      if ((($a = (($b = self.diceBot.$isD9(), $b !== false && $b !== nil && $b != null ?(dice_max['$=='](9)) : $b))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        d9_on = true;
        dice_max = $rb_plus(dice_max, 1);};
      if ((($a = (($b = ($rb_le(dice_cnt, $gvars.DICE_MAXCNT)), $b !== false && $b !== nil && $b != null ?($rb_le(dice_max, $gvars.DICE_MAXNUM)) : $b))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return [total, dice_str, numberSpot1, cnt_max, n_max, cnt_suc, rerollCount]
      };
      ($a = ($b = dice_cnt).$times, $a.$$p = (TMP_67 = function(i){var self = TMP_67.$$s || this, $c, $d, TMP_68, $e, dice_now = nil, dice_n = nil, dice_st_n = nil, round = nil, suc = nil;
        if (self.diceBot == null) self.diceBot = nil;
if (i == null) i = nil;
      i = $rb_plus(i, 1);
        dice_now = 0;
        dice_n = 0;
        dice_st_n = "";
        round = 0;
        (function(){var $brk = Opal.new_brk(); try {return ($c = ($d = self).$loop, $c.$$p = (TMP_68 = function(){var self = TMP_68.$$s || this, $e, $f;
          if (self.diceBot == null) self.diceBot = nil;

        if ((($e = ($rb_ge(round, 1))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            dice_now = $rb_plus(dice_now, self.diceBot.$getJackUpValueOnAddRoll(dice_n))};
          dice_n = $rb_plus(self.$rand(dice_max).$to_i(), 1);
          if ((($e = (d9_on)) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            dice_n = $rb_minus(dice_n, 1)};
          dice_now = $rb_plus(dice_now, dice_n);
          self.$debug("@diceBot.sendMode", self.diceBot.$sendMode());
          if ((($e = ($rb_ge(self.diceBot.$sendMode(), 2))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            if ((($e = (dice_st_n['$empty?']())) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
              } else {
              dice_st_n = $rb_plus(dice_st_n, ",")
            };
            dice_st_n = $rb_plus(dice_st_n, "" + (dice_n));};
          round = $rb_plus(round, 1);
          if ((($e = ((($f = ($rb_gt(dice_add, 1)), $f !== false && $f !== nil && $f != null ?($rb_ge(dice_n, dice_add)) : $f))['$!']())) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
            
            Opal.brk(nil, $brk)
            } else {
            return nil
          };}, TMP_68.$$s = self, TMP_68.$$brk = $brk, TMP_68.$$arity = 0, TMP_68), $c).call($d)
        } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
        total = $rb_plus(total, dice_now);
        if ((($c = (dice_ul['$!='](""))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          suc = self.$check_hit(dice_now, dice_ul, dice_diff);
          cnt_suc = $rb_plus(cnt_suc, suc);};
        if ((($c = (dice_re)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          if ((($c = ($rb_ge(dice_now, dice_re))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            rerollCount = $rb_plus(rerollCount, 1)}};
        if ((($c = (($e = ($rb_ge(self.diceBot.$sendMode(), 2)), $e !== false && $e !== nil && $e != null ?($rb_ge(round, 2)) : $e))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          dice_result.$push("" + (dice_now) + "[" + (dice_st_n) + "]")
          } else {
          dice_result.$push(dice_now)
        };
        if ((($c = (dice_now['$=='](1))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          numberSpot1 = $rb_plus(numberSpot1, 1)};
        if ((($c = (dice_now['$=='](dice_max))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          cnt_max = $rb_plus(cnt_max, 1)};
        if ((($c = ($rb_gt(dice_now, n_max))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return n_max = dice_now
          } else {
          return nil
        };}, TMP_67.$$s = self, TMP_67.$$arity = 1, TMP_67), $a).call($b);
      if ((($a = (dice_sort['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        dice_str = ($a = ($c = dice_result).$sort_by, $a.$$p = (TMP_69 = function(a){var self = TMP_69.$$s || this;
if (a == null) a = nil;
        return self.$dice_num(a)}, TMP_69.$$s = self, TMP_69.$$arity = 1, TMP_69), $a).call($c).$join(",")
        } else {
        dice_str = dice_result.$join(",")
      };
      return [total, dice_str, numberSpot1, cnt_max, n_max, cnt_suc, rerollCount];
    }, TMP_70.$$arity = -3);

    Opal.defn(self, '$setRandomValues', TMP_71 = function $$setRandomValues(rands) {
      var self = this;

      return self.rands = rands;
    }, TMP_71.$$arity = 1);

    Opal.defn(self, '$rand', TMP_72 = function $$rand(max) {
      var $a, self = this, value = nil;

      self.$debug("rand called @rands", self.rands);
      value = 0;
      if ((($a = (self.rands['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        value = self.$randNomal(max)
        } else {
        value = self.$randFromRands(max)
      };
      if ((($a = (self.randResults['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.randResults['$<<']([($rb_plus(value, 1)), max])
      };
      return value;
    }, TMP_72.$$arity = 1);

    Opal.defn(self, '$setCollectRandResult', TMP_73 = function $$setCollectRandResult(b) {
      var $a, self = this;

      if ((($a = (b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.randResults = []
        } else {
        return self.randResults = nil
      };
    }, TMP_73.$$arity = 1);

    Opal.defn(self, '$getRandResults', TMP_74 = function $$getRandResults() {
      var self = this;

      return self.randResults;
    }, TMP_74.$$arity = 0);

    Opal.defn(self, '$randNomal', TMP_75 = function $$randNomal(max) {
      var self = this;

      return $scope.get('Kernel').$rand(max);
    }, TMP_75.$$arity = 1);

    Opal.defn(self, '$randFromRands', TMP_76 = function $$randFromRands(targetMax) {
      var $a, $b, self = this, nextRand = nil, value = nil, max = nil;

      nextRand = self.rands.$shift();
      if ((($a = (nextRand['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise("nextRand is nil, so @rands is empty!! @rands:" + (self.rands.$inspect()))};
      $b = nextRand, $a = Opal.to_ary($b), value = ($a[0] == null ? nil : $a[0]), max = ($a[1] == null ? nil : $a[1]), $b;
      value = value.$to_i();
      max = max.$to_i();
      if ((($a = (max['$!='](targetMax))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise("invalid max value! [ " + (value) + " / " + (max) + " ] but NEED [ " + (targetMax) + " ] dice")};
      return ($rb_minus(value, 1));
    }, TMP_76.$$arity = 1);

    Opal.defn(self, '$dice_num', TMP_77 = function $$dice_num(dice_str) {
      var self = this;

      dice_str = dice_str.$to_s();
      return dice_str.$sub(/\[[\d,]+\]/, "").$to_i();
    }, TMP_77.$$arity = 1);

    Opal.defn(self, '$bdice', TMP_79 = function $$bdice(string) {
      var $a, $b, TMP_78, self = this, total_n = nil, suc = nil, signOfInequality = nil, diff = nil, output = nil, dice_a = nil, dice_cnt_total = nil, numberSpot1 = nil;

      total_n = 0;
      suc = 0;
      signOfInequality = "";
      diff = 0;
      output = "";
      string = string.$gsub(/-[\d]+B[\d]+/, "");
      if ((($a = (/(^|\s)S?(([\d]+B[\d]+(\+[\d]+B[\d]+)*)(([<>=]+)([\d]+))?)($|\s)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        output = "1";
        return output;
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      if ((($a = ((($b = $gvars['~']) === nil ? nil : $b['$[]'](5)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](7)).$to_i();
        string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
        signOfInequality = self.$marshalSignOfInequality((($a = $gvars['~']) === nil ? nil : $a['$[]'](6)));
      } else if ((($a = (/([<>=]+)(\d+)/['$=~'](self.diceBot.$defaultSuccessTarget()))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diff = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2)).$to_i();
        signOfInequality = self.$marshalSignOfInequality((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)));};
      dice_a = string.$split(/\+/);
      dice_cnt_total = 0;
      numberSpot1 = 0;
      ($a = ($b = dice_a).$each, $a.$$p = (TMP_78 = function(dice_o){var self = TMP_78.$$s || this, $c, $d, dice_cnt = nil, dice_max = nil, dice_dat = nil;
        if (self.diceBot == null) self.diceBot = nil;
if (dice_o == null) dice_o = nil;
      $d = dice_o.$split(/[bB]/), $c = Opal.to_ary($d), dice_cnt = ($c[0] == null ? nil : $c[0]), dice_max = ($c[1] == null ? nil : $c[1]), $d;
        dice_cnt = dice_cnt.$to_i();
        dice_max = dice_max.$to_i();
        dice_dat = self.$roll(dice_cnt, dice_max, (self.diceBot.$sortType()['$&'](2)), 0, signOfInequality, diff);
        suc = $rb_plus(suc, dice_dat['$[]'](5));
        if ((($c = (output['$!='](""))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          output = $rb_plus(output, ",")};
        output = $rb_plus(output, dice_dat['$[]'](1));
        numberSpot1 = $rb_plus(numberSpot1, dice_dat['$[]'](2));
        return dice_cnt_total = $rb_plus(dice_cnt_total, dice_cnt);}, TMP_78.$$s = self, TMP_78.$$arity = 1, TMP_78), $a).call($b);
      if ((($a = (signOfInequality['$!='](""))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        string = $rb_plus(string, "" + (signOfInequality) + (diff));
        output = "" + (output) + " ＞ 成功数" + (suc);
        output = $rb_plus(output, self.diceBot.$getGrichText(numberSpot1, dice_cnt_total, suc));};
      output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (output);
      return output;
    }, TMP_79.$$arity = 1);

    Opal.defn(self, '$isReRollAgain', TMP_80 = function $$isReRollAgain(dice_cnt, round) {
      var $a, $b, self = this;

      self.$debug("isReRollAgain dice_cnt, round", dice_cnt, round);
      return (($a = ($rb_gt(dice_cnt, 0)), $a !== false && $a !== nil && $a != null ?(((($b = ($rb_lt(round, self.diceBot.$rerollLimitCount()))) !== false && $b !== nil && $b != null) ? $b : (self.diceBot.$rerollLimitCount()['$=='](0)))) : $a));
    }, TMP_80.$$arity = 2);

    Opal.defn(self, '$rollD66', TMP_81 = function $$rollD66(string) {
      var $a, $b, self = this, output = nil, secret = nil;

      if ((($a = (/^S?D66/i['$==='](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = (self.diceBot.$d66Type()['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      self.$debug("match D66 roll");
      $b = self.$d66dice(string), $a = Opal.to_ary($b), output = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), $b;
      return [output, secret];
    }, TMP_81.$$arity = 1);

    Opal.defn(self, '$d66dice', TMP_83 = function $$d66dice(string) {
      var $a, $b, TMP_82, self = this, secret = nil, output = nil, count = nil, swapMarker = nil, d66List = nil, d66Text = nil;

      string = string.$upcase();
      secret = false;
      output = "1";
      $b = self.$getD66Infos(string), $a = Opal.to_ary($b), string = ($a[0] == null ? nil : $a[0]), secret = ($a[1] == null ? nil : $a[1]), count = ($a[2] == null ? nil : $a[2]), swapMarker = ($a[3] == null ? nil : $a[3]), $b;
      if ((($a = (string['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [output, secret]};
      self.$debug("d66dice count", count);
      d66List = [];
      ($a = ($b = count).$times, $a.$$p = (TMP_82 = function(i){var self = TMP_82.$$s || this;
if (i == null) i = nil;
      return d66List['$<<'](self.$getD66ValueByMarker(swapMarker))}, TMP_82.$$s = self, TMP_82.$$arity = 1, TMP_82), $a).call($b);
      d66Text = d66List.$join(",");
      self.$debug("d66Text", d66Text);
      output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (d66Text);
      return [output, secret];
    }, TMP_83.$$arity = 1);

    Opal.defn(self, '$getD66Infos', TMP_84 = function $$getD66Infos(string) {
      var $a, $b, self = this, secret = nil, count = nil, swapMarker = nil;

      self.$debug("getD66Infos, string", string);
      if ((($a = (/(^|\s)(S)?((\d+)?D66(N|S)?)(\s|$)/i['$==='](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      secret = ((($a = $gvars['~']) === nil ? nil : $a['$[]'](2))['$nil?']()['$!']());
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](3));
      count = (((($a = (($b = $gvars['~']) === nil ? nil : $b['$[]'](4))) !== false && $a !== nil && $a != null) ? $a : 1)).$to_i();
      swapMarker = (((($a = (($b = $gvars['~']) === nil ? nil : $b['$[]'](5))) !== false && $a !== nil && $a != null) ? $a : "")).$upcase();
      return [string, secret, count, swapMarker];
    }, TMP_84.$$arity = 1);

    Opal.defn(self, '$getD66ValueByMarker', TMP_85 = function $$getD66ValueByMarker(swapMarker) {
      var self = this, $case = nil, isSwap = nil;

      return (function() {$case = swapMarker;if ("S"['$===']($case)) {isSwap = true;
      return self.$getD66(isSwap);}else if ("N"['$===']($case)) {isSwap = false;
      return self.$getD66(isSwap);}else {return self.$getD66Value()}})();
    }, TMP_85.$$arity = 1);

    Opal.defn(self, '$getD66Value', TMP_86 = function $$getD66Value(mode) {
      var $a, self = this, isSwap = nil;

      if (mode == null) {
        mode = nil;
      }
      ((($a = mode) !== false && $a !== nil && $a != null) ? $a : mode = self.diceBot.$d66Type());
      isSwap = ($rb_gt(mode, 1));
      return self.$getD66(isSwap);
    }, TMP_86.$$arity = -1);

    Opal.defn(self, '$getD66', TMP_87 = function $$getD66(isSwap) {
      var $a, $b, self = this, output = nil, dice_a = nil, dice_b = nil;

      output = 0;
      dice_a = $rb_plus(self.$rand(6), 1);
      dice_b = $rb_plus(self.$rand(6), 1);
      self.$debug("dice_a", dice_a);
      self.$debug("dice_b", dice_b);
      if ((($a = ((($b = isSwap !== false && isSwap !== nil && isSwap != null) ? ($rb_gt(dice_a, dice_b)) : isSwap))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        output = $rb_plus(dice_a, $rb_times(dice_b, 10))
        } else {
        output = $rb_plus($rb_times(dice_a, 10), dice_b)
      };
      self.$debug("output", output);
      return output;
    }, TMP_87.$$arity = 1);

    Opal.defn(self, '$openSecretRoll', TMP_89 = function $$openSecretRoll(channel, mode) {
      var $a, $b, TMP_88, self = this, messages = nil, memberKey = nil, members = nil;
      if ($gvars.secretRollMembersHolder == null) $gvars.secretRollMembersHolder = nil;

      self.$debug("openSecretRoll begin");
      channel = channel.$upcase();
      messages = [];
      memberKey = self.$getSecretRollMembersHolderKey(channel, mode);
      members = $gvars.secretRollMembersHolder['$[]'](memberKey);
      if ((($a = (members['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("openSecretRoll members is nil. messages", messages);
        return messages;};
      ($a = ($b = members).$each, $a.$$p = (TMP_88 = function(member){var self = TMP_88.$$s || this, $c, diceResultKey = nil, diceResult = nil;
        if ($gvars.secretDiceResultHolder == null) $gvars.secretDiceResultHolder = nil;
if (member == null) member = nil;
      diceResultKey = self.$getSecretDiceResultHolderKey(channel, mode, member);
        self.$debug("openSecretRoll diceResulyKey", diceResultKey);
        diceResult = $gvars.secretDiceResultHolder['$[]'](diceResultKey);
        self.$debug("openSecretRoll diceResult", diceResult);
        if ((($c = (diceResult)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          messages.$push(diceResult);
          return $gvars.secretDiceResultHolder.$delete(diceResultKey);
          } else {
          return nil
        };}, TMP_88.$$s = self, TMP_88.$$arity = 1, TMP_88), $a).call($b);
      if ((($a = ($rb_le(mode, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$debug("delete recorde data");
        $gvars.secretRollMembersHolder.$delete(channel);};
      self.$debug("openSecretRoll result messages", messages);
      return messages;
    }, TMP_89.$$arity = 2);

    Opal.defn(self, '$getNick', TMP_90 = function $$getNick(nick) {
      var $a, self = this;

      if (nick == null) {
        nick = nil;
      }
      ((($a = nick) !== false && $a !== nil && $a != null) ? $a : nick = self.nick_e);
      nick = nick.$upcase();
      /[_\d]*(.+)[_\d]*/['$=~'](nick);
      nick = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      return nick;
    }, TMP_90.$$arity = -1);

    Opal.defn(self, '$addToSecretDiceResult', TMP_91 = function $$addToSecretDiceResult(diceResult, channel, mode) {
      var self = this, nick = nil;

      nick = self.$getNick();
      channel = channel.$upcase();
      self.$addToSecretRollMembersHolder(channel, mode);
      self.$saveSecretDiceResult(diceResult, channel, mode);
      return self.isMessagePrinted = true;
    }, TMP_91.$$arity = 3);

    Opal.defn(self, '$addToSecretRollMembersHolder', TMP_92 = function $$addToSecretRollMembersHolder(channel, mode) {
      var $a, $b, $c, self = this, key = nil, members = nil, nick = nil;
      if ($gvars.secretRollMembersHolder == null) $gvars.secretRollMembersHolder = nil;

      key = self.$getSecretRollMembersHolderKey(channel, mode);
      ($a = key, $b = $gvars.secretRollMembersHolder, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])));
      members = $gvars.secretRollMembersHolder['$[]'](key);
      nick = self.$getNick();
      if ((($a = (members['$include?'](nick))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return members.$push(nick)
      };
    }, TMP_92.$$arity = 2);

    Opal.defn(self, '$getSecretRollMembersHolderKey', TMP_93 = function $$getSecretRollMembersHolderKey(channel, mode) {
      var self = this;

      return "" + (mode) + "," + (channel);
    }, TMP_93.$$arity = 2);

    Opal.defn(self, '$saveSecretDiceResult', TMP_94 = function $$saveSecretDiceResult(diceResult, channel, mode) {
      var $a, self = this, nick = nil, key = nil;
      if ($gvars.secretDiceResultHolder == null) $gvars.secretDiceResultHolder = nil;

      nick = self.$getNick();
      if ((($a = (mode['$!='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        diceResult = "" + (nick) + ": " + (diceResult)};
      key = self.$getSecretDiceResultHolderKey(channel, mode, nick);
      $gvars.secretDiceResultHolder['$[]='](key, diceResult);
      self.$debug("key", key);
      return self.$debug("secretDiceResultHolder", $gvars.secretDiceResultHolder);
    }, TMP_94.$$arity = 3);

    Opal.defn(self, '$getSecretDiceResultHolderKey', TMP_95 = function $$getSecretDiceResultHolderKey(channel, mode, nick) {
      var self = this, key = nil;

      key = "" + (mode) + "," + (channel) + "," + (nick);
      return key;
    }, TMP_95.$$arity = 3);

    Opal.defn(self, '$setPrintPlotChannel', TMP_96 = function $$setPrintPlotChannel() {
      var self = this, nick = nil;
      if ($gvars.plotPrintChannels == null) $gvars.plotPrintChannels = nil;

      nick = self.$getNick();
      return $gvars.plotPrintChannels['$[]='](nick, self.channel);
    }, TMP_96.$$arity = 0);

    Opal.defn(self, '$choice_random', TMP_97 = function $$choice_random(string) {
      var $a, self = this, output = nil, targetList = nil, targets = nil, index = nil, target = nil;

      output = "1";
      if ((($a = (/(^|\s)((S)?choice\[([^,]+(,[^,]+)+)\])($|\s)/i['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](2));
      targetList = (($a = $gvars['~']) === nil ? nil : $a['$[]'](4));
      if ((($a = (targetList)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return output
      };
      targets = targetList.$split(/,/);
      index = self.$rand(targets.$length());
      target = targets['$[]'](index);
      output = "" + (self.nick_e) + ": (" + (string) + ") ＞ " + (target);
      return output;
    }, TMP_97.$$arity = 1);

    Opal.defn(self, '$getMarshaledSignOfInequality', TMP_98 = function $$getMarshaledSignOfInequality(text) {
      var $a, self = this;

      if ((($a = (text['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      return self.$marshalSignOfInequality(text);
    }, TMP_98.$$arity = 1);

    Opal.defn(self, '$marshalSignOfInequality', TMP_99 = function $$marshalSignOfInequality(signOfInequality) {
      var self = this, $case = nil;

      $case = signOfInequality;if (/(<=|=<)/['$===']($case)) {return "<="}else if (/(>=|=>)/['$===']($case)) {return ">="}else if (/(<>)/['$===']($case)) {return "<>"}else if (/[<]+/['$===']($case)) {return "<"}else if (/[>]+/['$===']($case)) {return ">"}else if (/[=]+/['$===']($case)) {return "="};
      return signOfInequality;
    }, TMP_99.$$arity = 1);

    Opal.defn(self, '$check_hit', TMP_100 = function $$check_hit(dice_now, signOfInequality, diff) {
      var $a, self = this, suc = nil, $case = nil;

      suc = 0;
      if ((($a = (diff['$is_a?']($scope.get('String')))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (/\d/['$=~'](diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          return suc
        };
        diff = diff.$to_i();};
      $case = signOfInequality;if (/(<=|=<)/['$===']($case)) {if ((($a = ($rb_le(dice_now, diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}}else if (/(>=|=>)/['$===']($case)) {if ((($a = ($rb_ge(dice_now, diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}}else if (/(<>)/['$===']($case)) {if ((($a = (dice_now['$!='](diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}}else if (/[<]+/['$===']($case)) {if ((($a = ($rb_lt(dice_now, diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}}else if (/[>]+/['$===']($case)) {if ((($a = ($rb_gt(dice_now, diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}}else if (/[=]+/['$===']($case)) {if ((($a = (dice_now['$=='](diff))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        suc = $rb_plus(suc, 1)}};
      return suc;
    }, TMP_100.$$arity = 3);

    Opal.defn(self, '$check_suc', TMP_101 = function $$check_suc($a_rest) {
      var $b, $c, self = this, check_param, total_n = nil, dice_n = nil, signOfInequality = nil, diff = nil, dice_cnt = nil, dice_max = nil, n1 = nil, n_max = nil, check_paramNew = nil, text = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      check_param = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        check_param[$arg_idx - 0] = arguments[$arg_idx];
      }
      $b = Opal.to_a(check_param), total_n = ($b[0] == null ? nil : $b[0]), dice_n = ($b[1] == null ? nil : $b[1]), signOfInequality = ($b[2] == null ? nil : $b[2]), diff = ($b[3] == null ? nil : $b[3]), dice_cnt = ($b[4] == null ? nil : $b[4]), dice_max = ($b[5] == null ? nil : $b[5]), n1 = ($b[6] == null ? nil : $b[6]), n_max = ($b[7] == null ? nil : $b[7]), $b;
      self.$debug("check params : total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max", total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max);
      if ((($b = (/((\+|\-)?[\d]+)[)]?$/['$=~'](total_n.$to_s()))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        } else {
        return ""
      };
      total_n = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1)).$to_i();
      diff = diff.$to_i();
      check_paramNew = [total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max];
      text = ($b = self).$getSuccessText.apply($b, Opal.to_a(check_paramNew));
      ((($c = text) !== false && $c !== nil && $c != null) ? $c : text = "");
      if ((($c = (text['$empty?']())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
        if ((($c = (signOfInequality['$!='](""))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          self.$debug("どれでもないけど判定するとき");
          return ($c = self).$check_nDx.apply($c, Opal.to_a(check_param));}};
      return text;
    }, TMP_101.$$arity = -1);

    Opal.defn(self, '$getSuccessText', TMP_102 = function $$getSuccessText($a_rest) {
      var $b, $c, $d, $e, $f, self = this, check_param, total_n = nil, dice_n = nil, signOfInequality = nil, diff = nil, dice_cnt = nil, dice_max = nil, n1 = nil, n_max = nil, result = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      check_param = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        check_param[$arg_idx - 0] = arguments[$arg_idx];
      }
      self.$debug("getSuccessText begin");
      $b = Opal.to_a(check_param), total_n = ($b[0] == null ? nil : $b[0]), dice_n = ($b[1] == null ? nil : $b[1]), signOfInequality = ($b[2] == null ? nil : $b[2]), diff = ($b[3] == null ? nil : $b[3]), dice_cnt = ($b[4] == null ? nil : $b[4]), dice_max = ($b[5] == null ? nil : $b[5]), n1 = ($b[6] == null ? nil : $b[6]), n_max = ($b[7] == null ? nil : $b[7]), $b;
      self.$debug("dice_max, dice_cnt", dice_max, dice_cnt);
      if ((($b = (($c = (dice_max['$=='](100)), $c !== false && $c !== nil && $c != null ?(dice_cnt['$=='](1)) : $c))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$debug("1D100判定");
        return ($b = self.diceBot).$check_1D100.apply($b, Opal.to_a(check_param));};
      if ((($c = (($d = (dice_max['$=='](20)), $d !== false && $d !== nil && $d != null ?(dice_cnt['$=='](1)) : $d))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
        self.$debug("1d20判定");
        return ($c = self.diceBot).$check_1D20.apply($c, Opal.to_a(check_param));};
      if ((($d = (dice_max['$=='](10))) !== nil && $d != null && (!$d.$$is_boolean || $d == true))) {
        self.$debug("d10ベース判定");
        return ($d = self.diceBot).$check_nD10.apply($d, Opal.to_a(check_param));};
      if ((($e = (dice_max['$=='](6))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
        if ((($e = (dice_cnt['$=='](2))) !== nil && $e != null && (!$e.$$is_boolean || $e == true))) {
          self.$debug("2d6判定");
          result = ($e = self.diceBot).$check_2D6.apply($e, Opal.to_a(check_param));
          if ((($f = (result['$empty?']())) !== nil && $f != null && (!$f.$$is_boolean || $f == true))) {
            } else {
            return result
          };};
        self.$debug("xD6判定");
        return ($f = self.diceBot).$check_nD6.apply($f, Opal.to_a(check_param));};
      return "";
    }, TMP_102.$$arity = -1);

    Opal.defn(self, '$check_nDx', TMP_103 = function $$check_nDx(total_n, dice_n, signOfInequality, diff, dice_cnt, dice_max, n1, n_max) {
      var $a, self = this, success = nil;

      self.$debug("check_nDx begin diff", diff);
      success = self.$check_hit(total_n, signOfInequality, diff);
      self.$debug("check_nDx success", success);
      if ((($a = ($rb_ge(success, 1))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " ＞ 成功"};
      return " ＞ 失敗";
    }, TMP_103.$$arity = 8);

    Opal.defn(self, '$broadmsg', TMP_104 = function $$broadmsg(output, nick) {
      var $a, self = this;

      self.$debug("broadmsg output, nick", output, nick);
      self.$debug("@nick_e", self.nick_e);
      if ((($a = (output['$==']("1"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = (nick['$=='](self.nick_e))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sendMessageToOnlySender(output)
        } else {
        return self.$sendMessage(nick, output)
      };
    }, TMP_104.$$arity = 2);

    Opal.defn(self, '$sendMessage', TMP_105 = function $$sendMessage(to, message) {
      var self = this;

      self.$debug("sendMessage to, message", to, message);
      self.ircClient.$sendMessage(to, message);
      return self.isMessagePrinted = true;
    }, TMP_105.$$arity = 2);

    Opal.defn(self, '$sendMessageToOnlySender', TMP_106 = function $$sendMessageToOnlySender(message) {
      var self = this;

      self.$debug("sendMessageToOnlySender message", message);
      self.$debug("@nick_e", self.nick_e);
      self.ircClient.$sendMessageToOnlySender(self.nick_e, message);
      return self.isMessagePrinted = true;
    }, TMP_106.$$arity = 1);

    Opal.defn(self, '$sendMessageToChannels', TMP_107 = function $$sendMessageToChannels(message) {
      var self = this;

      self.ircClient.$sendMessageToChannels(message);
      return self.isMessagePrinted = true;
    }, TMP_107.$$arity = 1);

    Opal.defn(self, '$parren_killer', TMP_109 = function $$parren_killer(string) {
      var $a, $b, $c, TMP_108, self = this, str_before = nil, str_after = nil, dice_cmd = nil, rolled = nil, dmy = nil, str_a = nil, str_b = nil, par_i = nil, par_o = nil;
      if ($gvars.str_a == null) $gvars.str_a = nil;

      self.$debug("parren_killer input", string);
      while ((($b = (/^(.*?)\[(\d+[Dd]\d+)\](.*)/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      str_before = "";
      str_after = "";
      dice_cmd = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2));
      if ((($b = ((($c = $gvars['~']) === nil ? nil : $c['$[]'](1)))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        str_before = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1))};
      if ((($b = ((($c = $gvars['~']) === nil ? nil : $c['$[]'](3)))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        str_after = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3))};
      $c = self.$rollDiceAddingUp(dice_cmd), $b = Opal.to_ary($c), rolled = ($b[0] == null ? nil : $b[0]), dmy = ($b[1] == null ? nil : $b[1]), $c;
      string = "" + (str_before) + (rolled) + (str_after);};
      string = self.$changeRangeTextToNumberText(string);
      while ((($b = (/^(.*?)(\([\d\/*+-]+?\))(.*)/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      self.$debug("while string", string);
      str_a = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3));
      ((($b = str_a) !== false && $b !== nil && $b != null) ? $b : str_a = "");
      str_b = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1));
      ((($b = str_b) !== false && $b !== nil && $b != null) ? $b : str_b = "");
      self.$debug("str_b", str_b);
      par_i = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2));
      self.$debug("par_i", par_i);
      par_o = self.$paren_k(par_i);
      self.$debug("par_o", par_o);
      if ((($b = (par_o['$!='](0))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if ((($b = ($rb_lt(par_o, 0))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          if ((($b = (/(.+?)(\+)$/['$=~'](str_b))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            str_b = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1))
          } else if ((($b = (/(.+?)(-)$/['$=~'](str_b))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            str_b = "" + ((($b = $gvars['~']) === nil ? nil : $b['$[]'](1))) + "+";
            par_o = $rb_times(par_o, -1);}};
        string = "" + (str_b) + (par_o) + (str_a);
        } else {
        if ((($b = (/^([DBRUdbru][\d]+)(.*)/['$=~']($gvars.str_a))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          str_a = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2))};
        string = "" + (str_b) + "0" + (str_a);
      };};
      self.$debug("diceBot.changeText(string) begin", string);
      string = self.diceBot.$changeText(string);
      self.$debug("diceBot.changeText(string) end", string);
      string = ($a = ($b = string).$gsub, $a.$$p = (TMP_108 = function(){var self = TMP_108.$$s || this, $d;

      return "" + ((($d = $gvars['~']) === nil ? nil : $d['$[]'](1))) + "6" + ((($d = $gvars['~']) === nil ? nil : $d['$[]'](2)))}, TMP_108.$$s = self, TMP_108.$$arity = 0, TMP_108), $a).call($b, /([\d]+[dD])([^\d\w]|$)/);
      self.$debug("parren_killer output", string);
      return string;
    }, TMP_109.$$arity = 1);

    Opal.defn(self, '$rollDiceAddingUp', TMP_110 = function $$rollDiceAddingUp($a_rest) {
      var $b, self = this, arg, dice = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      arg = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        arg[$arg_idx - 0] = arguments[$arg_idx];
      }
      dice = $scope.get('AddDice').$new(self, self.diceBot);
      return ($b = dice).$rollDiceAddingUp.apply($b, Opal.to_a(arg));
    }, TMP_110.$$arity = -1);

    Opal.defn(self, '$changeRangeTextToNumberText', TMP_111 = function $$changeRangeTextToNumberText(string) {
      var $a, $b, $c, self = this, beforeText = nil, rangeBegin = nil, rangeEnd = nil, afterText = nil, range = nil, rolledNumber = nil, resultNumber = nil;

      self.$debug("[st...ed] before string", string);
      while ((($b = (/^(.*?)\[(\d+)[.]{3}(\d+)\](.*)/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      beforeText = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1));
      ((($b = beforeText) !== false && $b !== nil && $b != null) ? $b : beforeText = "");
      rangeBegin = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2)).$to_i();
      rangeEnd = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3)).$to_i();
      afterText = (($b = $gvars['~']) === nil ? nil : $b['$[]'](4));
      ((($b = afterText) !== false && $b !== nil && $b != null) ? $b : afterText = "");
      if ((($b = ($rb_lt(rangeBegin, rangeEnd))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        range = ($rb_plus($rb_minus(rangeEnd, rangeBegin), 1));
        self.$debug("range", range);
        $c = self.$roll(1, range), $b = Opal.to_ary($c), rolledNumber = ($b[0] == null ? nil : $b[0]), $c;
        resultNumber = $rb_plus($rb_minus(rangeBegin, 1), rolledNumber);
        string = "" + (beforeText) + (resultNumber) + (afterText);};};
      self.$debug("[st...ed] after string", string);
      return string;
    }, TMP_111.$$arity = 1);

    Opal.defn(self, '$paren_k', TMP_113 = function $$paren_k(string) {
      var $a, $b, TMP_112, self = this, result = nil, list = nil;

      result = 0;
      if ((($a = (/([\d\/*+-]+)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return result
      };
      string = (($a = $gvars['~']) === nil ? nil : $a['$[]'](1));
      string = string.$gsub(/\-\-/, "+");
      self.$debug("paren_k string", string);
      list = self.$split_plus_minus(string);
      self.$debug("paren_k list", list);
      result = 0;
      ($a = ($b = list).$each, $a.$$p = (TMP_112 = function(text){var self = TMP_112.$$s || this;
if (text == null) text = nil;
      return result = $rb_plus(result, self.$paren_k_loop(text))}, TMP_112.$$s = self, TMP_112.$$arity = 1, TMP_112), $a).call($b);
      return result;
    }, TMP_113.$$arity = 1);

    Opal.defn(self, '$split_plus_minus', TMP_115 = function $$split_plus_minus(string) {
      var $a, $b, TMP_114, self = this, list = nil, result = nil;

      list = string.$scan(/[\+\-]?[^\+\-]+/);
      self.$debug("split_plus_minus list", list);
      result = [];
      ($a = ($b = list.$length()).$times, $a.$$p = (TMP_114 = function(i){var self = TMP_114.$$s || this, $c;
if (i == null) i = nil;
      if ((($c = result['$empty?']()) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
        } else if ((($c = /(\*|\/)$/['$==='](result.$last())) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          result.$last()['$<<'](list['$[]'](i));
          return nil;;};
        return result['$<<'](list['$[]'](i));}, TMP_114.$$s = self, TMP_114.$$arity = 1, TMP_114), $a).call($b);
      self.$debug("split_plus_minus result", result);
      return result;
    }, TMP_115.$$arity = 1);

    Opal.defn(self, '$paren_k_loop', TMP_116 = function $$paren_k_loop(string) {
      var self = this, result = nil;

      self.$debug("paren_k_plus Begin", string);
      result = self.$paren_k_calculate_multiple_divide_text(string);
      self.$debug("paren_k_plus End result", result);
      return result;
    }, TMP_116.$$arity = 1);

    Opal.defn(self, '$paren_k_calculate_multiple_divide_text', TMP_117 = function $$paren_k_calculate_multiple_divide_text(string) {
      var $a, $b, self = this, multi = nil, divide = nil, result = nil;

      multi = 1;
      divide = 1;
      $b = self.$paren_k_multi(string), $a = Opal.to_ary($b), string = ($a[0] == null ? nil : $a[0]), multi = ($a[1] == null ? nil : $a[1]), $b;
      $b = self.$paren_k_devide(string), $a = Opal.to_ary($b), string = ($a[0] == null ? nil : $a[0]), divide = ($a[1] == null ? nil : $a[1]), $b;
      result = self.$calculate_multiple_divide(string, multi, divide);
      return result;
    }, TMP_117.$$arity = 1);

    Opal.defn(self, '$paren_k_multi', TMP_118 = function $$paren_k_multi(string) {
      var $a, $b, self = this, multi = nil, before = nil, after = nil, calculate_text = nil;

      self.$debug("paren_k_multi Begin string", string);
      multi = 1;
      while ((($b = (/(.*?)(\*[-\d]+)(.*)/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      before = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1));
      after = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3));
      calculate_text = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2));
      string = "" + (before) + (after);
      if ((($b = (/([-\d]+)/['$=~'](calculate_text))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        multi = $rb_times(multi, (($b = $gvars['~']) === nil ? nil : $b['$[]'](1)).$to_i())};};
      self.$debug("paren_k_multi End multi", multi);
      self.$debug("paren_k_multi End", string);
      return [string, multi];
    }, TMP_118.$$arity = 1);

    Opal.defn(self, '$paren_k_devide', TMP_119 = function $$paren_k_devide(string) {
      var $a, $b, self = this, divide = nil, before = nil, after = nil, calculate_text = nil;

      divide = 1;
      while ((($b = (/(.*?)(\/[-\d]+)(.*)/['$=~'](string))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      before = (($b = $gvars['~']) === nil ? nil : $b['$[]'](1));
      after = (($b = $gvars['~']) === nil ? nil : $b['$[]'](3));
      calculate_text = (($b = $gvars['~']) === nil ? nil : $b['$[]'](2));
      string = "" + (before) + (after);
      if ((($b = (/([-\d]+)/['$=~'](calculate_text))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        divide = $rb_times(divide, (($b = $gvars['~']) === nil ? nil : $b['$[]'](1)).$to_i())};};
      return [string, divide];
    }, TMP_119.$$arity = 1);

    Opal.defn(self, '$calculate_multiple_divide', TMP_120 = function $$calculate_multiple_divide(string, multi, divide) {
      var $a, self = this, result = nil, work = nil, $case = nil;

      result = 0;
      if ((($a = (divide['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return result};
      if ((($a = (/([-\d]+)/['$=~'](string))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return result
      };
      work = $rb_times(((($a = $gvars['~']) === nil ? nil : $a['$[]'](1)).$to_i()), multi);
      $case = self.diceBot.$fractionType();if ("roundUp"['$===']($case)) {result = ($rb_plus($rb_divide(work, divide), 0.999)).$to_i()}else if ("roundOff"['$===']($case)) {result = ($rb_plus($rb_divide(work, divide), 0.5)).$to_i()}else {result = ($rb_divide(work, divide)).$to_i()};
      return result;
    }, TMP_120.$$arity = 3);

    Opal.defn(self, '$setGameByTitle', TMP_121 = function $$setGameByTitle(gameTitle) {
      var $a, self = this, loader = nil, diceBot = nil, message = nil;

      self.$debug("setGameByTitle gameTitle", gameTitle);
      self.cardTrader.$initValues();
      loader = $scope.get('DiceBotLoaderList').$find(gameTitle);
      diceBot = (function() {if (loader !== false && loader !== nil && loader != null) {
        return loader.$loadDiceBot()
        } else {
        return ((($a = $scope.get('DiceBotLoader').$loadUnknownGame(gameTitle)) !== false && $a !== nil && $a != null) ? $a : $scope.get('DiceBot').$new())
      }; return nil; })();
      self.$setDiceBot(diceBot);
      diceBot.$postSet();
      message = "Game設定を" + (diceBot.$gameName()) + "に設定しました";
      self.$debug("setGameByTitle message", message);
      return message;
    }, TMP_121.$$arity = 1);

    Opal.defn(self, '$setIrcMode', TMP_122 = function $$setIrcMode(mode) {
      var self = this;

      return self.isIrcMode = mode;
    }, TMP_122.$$arity = 1);

    return (Opal.defn(self, '$sleepForIrc', TMP_123 = function $$sleepForIrc(second) {
      var $a, self = this;

      if ((($a = (self.isIrcMode)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$sleep(second)
        } else {
        return nil
      };
    }, TMP_123.$$arity = 1), nil) && 'sleepForIrc';
  })($scope.base, null);
};

/* Generated by Opal 0.10.5 */
(function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var $a, $b, self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $klass = Opal.klass, $hash2 = Opal.hash2, bcDiceRoot = nil, bot = nil, result = nil, randResults = nil;
  if ($gvars.LOAD_PATH == null) $gvars.LOAD_PATH = nil;
  if ($gvars["0"] == null) $gvars["0"] = nil;

  Opal.add_stubs(['$expand_path', '$dirname', '$include?', '$unshift', '$require', '$attr', '$new', '$params', '$rollFromCgiParams', '$cgiParams', '$[]', '$+', '$getDiceBotParamText', '$roll', '$executeDiceBot', '$gsub', '$empty?', '$newBcDice', '$setIrcClient', '$setRandomValues', '$isKeepSecretDice', '$setTest', '$setCollectRandResult', '$setDir', '$setIrcMode', '$!=', '$getGameType', '$setGameByTitle', '$setMessage', '$setChannel', '$recievePublicMessage', '$getRandResults', '$nil?', '$getGameCommandInfos', '$===', '$>', '$length', '$rollFromCgiParamsDummy', '$print']);
  bcDiceRoot = $scope.get('File').$expand_path($scope.get('File').$dirname("cgiDiceBot"));
  if ((($a = $gvars.LOAD_PATH['$include?'](bcDiceRoot)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
    } else {
    $gvars.LOAD_PATH.$unshift(bcDiceRoot)
  };
  self.$require("bcdiceCore.rb");
  (function($base, $super) {
    function $CgiDiceBot(){};
    var self = $CgiDiceBot = $klass($base, $super, 'CgiDiceBot', $CgiDiceBot);

    var def = self.$$proto, $scope = self.$$scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14;

    def.cgi = def.cgiParams = def.isTest = def.rands = def.rollResult = def.bcdice = nil;
    Opal.defn(self, '$initialize', TMP_1 = function $$initialize() {
      var self = this;

      self.rollResult = "";
      self.isSecret = false;
      self.rands = nil;
      self.isTest = false;
      self.bcdice = nil;
      return $gvars.SEND_STR_MAX = 99999;
    }, TMP_1.$$arity = 0);

    self.$attr("isSecret");

    Opal.defn(self, '$rollFromCgi', TMP_2 = function $$rollFromCgi() {
      var self = this, cgi = nil;

      cgi = $scope.get('CGI').$new();
      self.cgiParams = self.cgi.$params();
      return self.$rollFromCgiParams(self.$cgiParams());
    }, TMP_2.$$arity = 0);

    Opal.defn(self, '$rollFromCgiParamsDummy', TMP_3 = function $$rollFromCgiParamsDummy() {
      var self = this;

      self.cgiParams = $hash2(["message", "gameType", "channel", "state", "sendto", "color"], {"message": "STG20", "gameType": "TORG", "channel": "1", "state": "state", "sendto": "sendto", "color": "999999"});
      return self.$rollFromCgiParams();
    }, TMP_3.$$arity = 0);

    Opal.defn(self, '$rollFromCgiParams', TMP_4 = function $$rollFromCgiParams() {
      var $a, $b, self = this, message = nil, gameType = nil, result = nil, rollResult = nil, randResults = nil;

      message = self.cgiParams['$[]']("message");
      gameType = self.cgiParams['$[]']("gameType");
      ((($a = gameType) !== false && $a !== nil && $a != null) ? $a : gameType = "diceBot");
      result = "";
      result = $rb_plus(result, "##>customBot BEGIN<##");
      result = $rb_plus(result, self.$getDiceBotParamText("channel"));
      result = $rb_plus(result, self.$getDiceBotParamText("name"));
      result = $rb_plus(result, self.$getDiceBotParamText("state"));
      result = $rb_plus(result, self.$getDiceBotParamText("sendto"));
      result = $rb_plus(result, self.$getDiceBotParamText("color"));
      result = $rb_plus(result, message);
      $b = self.$roll(message, gameType), $a = Opal.to_ary($b), rollResult = ($a[0] == null ? nil : $a[0]), randResults = ($a[1] == null ? nil : $a[1]), $b;
      result = $rb_plus(result, rollResult);
      result = $rb_plus(result, "##>customBot END<##");
      return result;
    }, TMP_4.$$arity = 0);

    Opal.defn(self, '$getDiceBotParamText', TMP_5 = function $$getDiceBotParamText(paramName) {
      var $a, self = this, param = nil;

      param = self.cgiParams['$[]'](paramName);
      ((($a = param) !== false && $a !== nil && $a != null) ? $a : param = "");
      return "" + (param) + "\t";
    }, TMP_5.$$arity = 1);

    Opal.defn(self, '$roll', TMP_6 = function $$roll(message, gameType, dir, prefix, isNeedResult) {
      var $a, $b, self = this, rollResult = nil, randResults = nil, result = nil;

      if (dir == null) {
        dir = nil;
      }
      if (prefix == null) {
        prefix = "";
      }
      if (isNeedResult == null) {
        isNeedResult = false;
      }
      $b = self.$executeDiceBot(message, gameType, dir, prefix, isNeedResult), $a = Opal.to_ary($b), rollResult = ($a[0] == null ? nil : $a[0]), randResults = ($a[1] == null ? nil : $a[1]), gameType = ($a[2] == null ? nil : $a[2]), $b;
      result = "";
      if ((($a = (self.isTest)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {};
      gameType = gameType.$gsub(/:.+$/, "");
      if ((($a = (rollResult['$empty?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        result = $rb_plus(result, "\n" + (gameType) + " " + (rollResult))
      };
      return [result, randResults];
    }, TMP_6.$$arity = -3);

    Opal.defn(self, '$setTest', TMP_7 = function $$setTest() {
      var self = this;

      return self.isTest = true;
    }, TMP_7.$$arity = 0);

    Opal.defn(self, '$setRandomValues', TMP_8 = function $$setRandomValues(rands) {
      var self = this;

      return self.rands = rands;
    }, TMP_8.$$arity = 1);

    Opal.defn(self, '$executeDiceBot', TMP_9 = function $$executeDiceBot(message, gameType, dir, prefix, isNeedResult) {
      var $a, self = this, bcdice = nil, channel = nil, nick_e = nil, rollResult = nil, randResults = nil;

      if (dir == null) {
        dir = nil;
      }
      if (prefix == null) {
        prefix = "";
      }
      if (isNeedResult == null) {
        isNeedResult = false;
      }
      bcdice = self.$newBcDice();
      bcdice.$setIrcClient(self);
      bcdice.$setRandomValues(self.rands);
      bcdice.$isKeepSecretDice(self.isTest);
      bcdice.$setTest(self.isTest);
      bcdice.$setCollectRandResult(isNeedResult);
      bcdice.$setDir(dir, prefix);
      bcdice.$setIrcMode(false);
      if ((($a = (bcdice.$getGameType()['$!='](gameType))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        bcdice.$setGameByTitle(gameType);
        gameType = bcdice.$getGameType();};
      bcdice.$setMessage(message);
      channel = "";
      nick_e = "";
      bcdice.$setChannel(channel);
      bcdice.$recievePublicMessage(nick_e);
      rollResult = self.rollResult;
      self.rollResult = "";
      randResults = bcdice.$getRandResults();
      return [rollResult, randResults, gameType];
    }, TMP_9.$$arity = -3);

    Opal.defn(self, '$newBcDice', TMP_10 = function $$newBcDice() {
      var $a, self = this, bcdiceMaker = nil;

      if ((($a = (self.bcdice['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        bcdiceMaker = $scope.get('BCDiceMaker').$new();
        self.bcdice = bcdiceMaker.$newBcDice();};
      return self.bcdice;
    }, TMP_10.$$arity = 0);

    Opal.defn(self, '$getGameCommandInfos', TMP_11 = function $$getGameCommandInfos(dir, prefix) {
      var self = this, tableFileData = nil, infos = nil;

      self.$require("TableFileData");
      tableFileData = $scope.get('TableFileData').$new();
      tableFileData.$setDir(dir, prefix);
      infos = tableFileData.$getGameCommandInfos();
      return infos;
    }, TMP_11.$$arity = 2);

    Opal.defn(self, '$sendMessage', TMP_12 = function $$sendMessage(to, message) {
      var self = this;

      return self.rollResult = $rb_plus(self.rollResult, message);
    }, TMP_12.$$arity = 2);

    Opal.defn(self, '$sendMessageToOnlySender', TMP_13 = function $$sendMessageToOnlySender(nick_e, message) {
      var self = this;

      self.isSecret = true;
      return self.rollResult = $rb_plus(self.rollResult, message);
    }, TMP_13.$$arity = 2);

    return (Opal.defn(self, '$sendMessageToChannels', TMP_14 = function $$sendMessageToChannels(message) {
      var self = this;

      return self.rollResult = $rb_plus(self.rollResult, message);
    }, TMP_14.$$arity = 1), nil) && 'sendMessageToChannels';
  })($scope.base, null);
  if ((($a = ($gvars["0"]['$===']("cgiDiceBot"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
    bot = $scope.get('CgiDiceBot').$new();
    result = "";
    if ((($a = ($rb_gt($scope.get('ARGV').$length(), 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      $b = bot.$roll($scope.get('ARGV')['$[]'](0), $scope.get('ARGV')['$[]'](1)), $a = Opal.to_ary($b), result = ($a[0] == null ? nil : $a[0]), randResults = ($a[1] == null ? nil : $a[1]), $b
      } else {
      result = bot.$rollFromCgiParamsDummy()
    };
    return self.$print($rb_plus(result, "\n"));
    } else {
    return nil
  };
})(Opal);

/* Generated by Opal 0.10.5 */
(function(Opal) {
  var self = Opal.top, $scope = Opal, nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$exit']);
  return $scope.get('Kernel').$exit()
})(Opal);