console.log("executeAST.js");

function isIterable(obj) {
  return obj != null && typeof obj[Symbol.iterator] === 'function';
}

function containsAwait(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'AwaitExpression') return true;

  for (const key in node) {
    if (key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      if (child.some(containsAwait)) return true;
    } else if (typeof child === 'object') {
      if (containsAwait(child)) return true;
    }
  }

  return false;
}

function isPromise(x) {
  return x && typeof x.then === 'function';
}

async function assignPattern(pattern, value, scope) {
  switch (pattern.type) {
    case "Identifier":
      setVariable(scope, pattern.name, value);
      return;

    case "ArrayPattern": {
      const arr = value ?? [];
      for (let i = 0; i < pattern.elements.length; i++) {
        const el = pattern.elements[i];
        if (!el) continue;
        if (el.type === "RestElement") {
          await assignPattern(el.argument, arr.slice(i), scope);
          break;
        }
        if (el.type === "AssignmentPattern") {
          const v = arr[i] === undefined ? await exec(el.right, scope) : arr[i];
          await assignPattern(el.left, v, scope);
        } else {
          await assignPattern(el, arr[i], scope);
        }
      }
      return;
    }

    case "ObjectPattern": {
      const obj = value ?? {};
      const pickedKeys = new Set();
      for (const prop of pattern.properties) {
        if (prop.type === "Property") {
          const key = prop.key.type === "Identifier"
            ? prop.key.name
            : await exec(prop.key, scope);
          pickedKeys.add(key);

          const target = prop.value;
          let v = obj[key];
          if (target.type === "AssignmentPattern") {
            v = v === undefined ? await exec(target.right, scope) : v;
            await assignPattern(target.left, v, scope);
          } else {
            await assignPattern(target, v, scope);
          }
        }
      }
      const restProp = pattern.properties.find(p => p.type === "RestElement");
      if (restProp) {
        const rest = {};
        for (const k of Object.keys(obj)) {
          if (!pickedKeys.has(k)) rest[k] = obj[k];
        }
        await assignPattern(restProp.argument, rest, scope);
      }
      return;
    }

    default:
      throw new Error(`Unsupported pattern type: ${pattern.type}`);
  }
}

function setVariable(scope, varName, value) {
  let currentScope = scope;
  while (currentScope) {
    if (Object.prototype.hasOwnProperty.call(currentScope, varName)) {
      currentScope[varName] = value;
      return;
    }
    currentScope = Object.getPrototypeOf(currentScope);
  }
  scope[varName] = value;
}

export async function executeAST(ast) {
  const baseScope = {
    console: console,

    fetch,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    RegExp,
    JSON,
    Error,
    setTimeout: (...args) => window.setTimeout(...args),
    clearTimeout: (...args) => window.clearTimeout(...args),
    setInterval: (...args) => window.setInterval(...args),
    clearInterval: (...args) => window.clearInterval(...args),

    encodeURI,
    decodeURI,
    encodeURIComponent,
    decodeURIComponent,

    DOMParser,

    alert,

    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    atob,
    btoa,
    decodeURIComponent,
    encodeURIComponent,

    URLSearchParams,

    window: window,

    navigator: navigator,

    location: window.location,

    localStorage: localStorage,

    Promise,
    Event,
    URL,

    Object: {
      assign: Object.assign,
      create: Object.create,
      defineProperties: Object.defineProperties,
      defineProperty: Object.defineProperty,
      entries: Object.entries,
      freeze: Object.freeze,
      fromEntries: Object.fromEntries,
      getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
      getOwnPropertyDescriptors: Object.getOwnPropertyDescriptors,
      getOwnPropertyNames: Object.getOwnPropertyNames,
      getPrototypeOf: Object.getPrototypeOf,
      is: Object.is,
      isExtensible: Object.isExtensible,
      isFrozen: Object.isFrozen,
      isSealed: Object.isSealed,
      keys: Object.keys,
      preventExtensions: Object.preventExtensions,
      seal: Object.seal,
      setPrototypeOf: Object.setPrototypeOf,
      values: Object.values
    },

    String,
    chrome: chrome,

    document,
  };


  async function exec(node, scope) {
    if (node == null) return;

    switch (node.type) {
      case "Program": {
        for (const stmt of node.body) {
          if (stmt.type === "FunctionDeclaration") {
            scope[stmt.id.name] = async function (...argsValues) {
              const fnScope = Object.create(scope);
              stmt.params.forEach((param, i) => {
                fnScope[param.name] = argsValues[i];
              });
              try {
                return await exec(stmt.body, fnScope);
              } catch (e) {
                if (e.__return) return e.value;
                throw e;
              }
            };
          }
        }
        let result;
        for (const stmt of node.body) {
          try {
            result = await exec(stmt, scope);
          } catch (e) {
            if (e.__return) return e.value;
            throw e;
          }
        }
        return result;
      }

      case "ExpressionStatement": return await exec(node.expression, scope);
      case "Literal":
        if (typeof node.regex === 'object' && node.regex !== null) {
          const { pattern, flags } = node.regex;
          return new RegExp(pattern, flags || "");
        }
        return node.value;

      case "Identifier": {
        if (node.name in scope) return scope[node.name];
        throw new ReferenceError(`Variabile non definita: ${node.name}`);
      }

      case "UpdateExpression": {
        const arg = node.argument;

        if (arg.type !== "Identifier") {
          throw new Error("UpdateExpression supporta solo Identifier come argomento");
        }

        const varName = arg.name;

        if (!(varName in scope)) {
          throw new ReferenceError(`Variabile non definita: ${varName}`);
        }

        if (typeof scope[varName] !== 'number') {
          throw new TypeError(`UpdateExpression supporta solo numeri. Got: ${typeof scope[varName]}`);
        }

        const oldValue = scope[varName];

        if (node.operator === "++") {
          scope[varName]++;
        } else if (node.operator === "--") {
          scope[varName]--;
        } else {
          throw new Error(`Unsupported update operator: ${node.operator}`);
        }

        return node.prefix ? scope[varName] : oldValue;
      }

      case "NewExpression": {
        const constructor = await exec(node.callee, scope);
        const args = await Promise.all(node.arguments.map(arg => exec(arg, scope)));
        if (typeof constructor !== "function") {
          throw new TypeError(`NewExpression: '${node.callee.type}' non è una funzione costruttrice. Got: ${typeof constructor}`);
        }
        return new constructor(...args);
      }

      case "TemplateLiteral": {
        const parts = node.quasis.map((q) => q.value.cooked);
        const expressions = await Promise.all(node.expressions.map(expr => exec(expr, scope)));
        let result = "";
        for (let i = 0; i < parts.length; i++) {
          result += parts[i];
          if (i < expressions.length) result += expressions[i];
        }
        return result;
      }

      case "VariableDeclaration": {
        for (const decl of node.declarations) {
          const initVal = decl.init ? await exec(decl.init, scope) : undefined;
          await assignPattern(decl.id, initVal, scope);
        }
        return;
      }

      case "ChainExpression": {
        return await exec(node.expression, scope);
      }

      case "CallExpression": {
        if (node.callee.type === "MemberExpression") {
          const member = node.callee;
          let obj = await exec(member.object, scope);

          if (typeof obj === "string" || obj instanceof String) {
            const prop = member.computed ? await exec(member.property, scope) : member.property.name;
            if (prop === "includes") {
              const arg0 = node.arguments[0] ? await exec(node.arguments[0], scope) : undefined;
              try {
                const res = obj.includes(arg0);
                return res;
              } catch (e) {
                throw e;
              }
            }
          }

          const isNodeList = (x) =>
            typeof NodeList !== "undefined" && (x instanceof NodeList || x instanceof HTMLCollection);

          if (isNodeList(obj)) {
            const prop = member.computed ? await exec(member.property, scope) : member.property.name;
            if (prop === "forEach") {
              const cb = await exec(node.arguments[0], scope);
              const thisArg = node.arguments[1] ? await exec(node.arguments[1], scope) : undefined;
              for (let i = 0; i < obj.length; i++) {
                let r = cb.call(thisArg, obj[i], i, obj);
                if (isPromise(r)) await r;
              }
              return undefined;
            }
          }

          if (Array.isArray(obj)) {
            const prop = member.computed
              ? await exec(member.property, scope)
              : member.property.name;

            const orig = obj[prop];
            if (typeof orig !== 'function') {
              throw new TypeError(`'${prop}' non è una funzione su Array`);
            }

            const args = [];
            for (const arg of node.arguments) {
              if (arg.type === "SpreadElement") {
                const spread = await exec(arg.argument, scope);
                if (!Array.isArray(spread)) {
                  throw new TypeError("SpreadElement deve essere un array");
                }
                args.push(...spread);
              } else {
                args.push(await exec(arg, scope));
              }
            }

            if (typeof args[0] === "function") {
              const cb = args[0];
              const thisArg = args[1];

              const callCb = async (el, i) => {
                try {
                  let r = cb.call(thisArg, el, i, obj);
                  if (isPromise(r)) {
                    try {
                      r = await r;
                    } catch (err) {
                      return false;
                    }
                  }
                  return r;
                } catch (err) {
                  return false;
                }
              };

              switch (prop) {
                case "find": {
                  for (let i = 0; i < obj.length; i++) {
                    const r = await callCb(obj[i], i);
                    if (r) {
                      return obj[i];
                    }
                  }
                  return undefined;
                }
                case "findIndex": {
                  for (let i = 0; i < obj.length; i++) {
                    const r = await callCb(obj[i], i);
                    if (r) { return i; }
                  }
                  return -1;
                }
                case "some": {
                  for (let i = 0; i < obj.length; i++) {
                    const r = await callCb(obj[i], i);
                    if (r) { return true; }
                  }
                  return false;
                }
                case "every": {
                  for (let i = 0; i < obj.length; i++) {
                    const r = await callCb(obj[i], i);
                    if (!r) { return false; }
                  }
                  return true;
                }
                case "filter": {
                  const out = [];
                  for (let i = 0; i < obj.length; i++) {
                    const r = await callCb(obj[i], i);
                    if (r) out.push(obj[i]);
                  }

                  return out;
                }
                case "map": {
                  const out = new Array(obj.length);
                  for (let i = 0; i < obj.length; i++) {
                    out[i] = await callCb(obj[i], i);
                  }

                  return out;
                }
                case "reduce": {
                  let start = 0;
                  let acc;
                  if (args.length >= 2) acc = args[1];
                  else {
                    if (obj.length === 0) throw new TypeError("Reduce of empty array with no initial value");
                    acc = obj[0]; start = 1;
                  }
                  for (let i = start; i < obj.length; i++) {
                    let r = cb.call(thisArg, acc, obj[i], i, obj);

                    acc = isPromise(r) ? await r : r;

                  }
                  return acc;
                }
                case "forEach": {
                  for (let i = 0; i < obj.length; i++) {
                    let r = cb.call(thisArg, obj[i], i, obj);
                    if (isPromise(r)) await r;
                  }
                  return undefined;
                }
              }
            }

            return orig.apply(obj, args);
          }


          if (member.optional && (obj === null || obj === undefined)) {
            return undefined;
          }

          const prop = member.computed
            ? await exec(member.property, scope)
            : member.property.name;

          if (obj === null || obj === undefined) {
            throw new TypeError(`Impossibile accedere al metodo '${prop}' di ${obj}`);
          }

          const fn = obj[prop];

          if (member.optional && fn === undefined) {
            return undefined;
          }

          if (typeof fn !== "function") {
            throw new TypeError(`'${prop}' non è una funzione`);
          }

          const args = [];
          for (const arg of node.arguments) {
            if (arg.type === "SpreadElement") {
              const spread = await exec(arg.argument, scope);
              if (!Array.isArray(spread)) {
                throw new TypeError("SpreadElement deve essere un array");
              }
              args.push(...spread);
            } else {
              args.push(await exec(arg, scope));
            }
          }

          return fn.apply(obj, args);
        }

        const fn = await exec(node.callee, scope);
        const args = await Promise.all(node.arguments.map(arg => exec(arg, scope)));

        if (typeof fn !== 'function') {
          throw new TypeError("Callee non è una funzione");
        }

        return fn(...args);
      }



      case "ClassDeclaration": {
        const className = node.id.name;
        const classBody = node.body.body;

        let constructorFunction = null;

        const classObj = function (...args) {
          const instance = Object.create(classObj.prototype);
          if (constructorFunction) {
            constructorFunction.apply(instance, args);
          }
          return instance;
        };

        for (const method of classBody) {
          if (!method || method.type !== "MethodDefinition" || !method.key || !method.value) continue;

          const methodName = method.key.name;
          const methodFn = async function (...argsValues) {
            const methodScope = Object.create(scope);
            method.value.params.forEach((param, i) => {
              methodScope[param.name] = argsValues[i];
            });
            methodScope.this = this;
            try {
              return await exec(method.value.body, methodScope);
            } catch (e) {
              if (e.__return) return e.value;
              throw e;
            }
          };

          if (method.kind === "constructor") {
            constructorFunction = methodFn;
          } else if (method.static) {
            classObj[methodName] = methodFn;
          } else {
            classObj.prototype[methodName] = methodFn;
          }
        }

        scope[className] = classObj;
        return;
      }



      case "MemberExpression": {
        let obj;

        try {
          obj = await exec(node.object, scope);
        } catch (e) {
          if (node.optional) {
            return undefined;
          } else {
            throw e;
          }
        }

        if (node.optional && (obj === null || obj === undefined)) {
          return undefined;
        }

        const prop = node.computed ? await exec(node.property, scope) : node.property.name;

        if (obj !== null && typeof obj !== 'object') {
          if (typeof obj === 'string') obj = new String(obj);
          else if (typeof obj === 'number') obj = new Number(obj);
          else if (typeof obj === 'boolean') obj = new Boolean(obj);
        }

        if (obj == null) {
          throw new TypeError(`Impossibile accedere a proprietà '${prop}' di ${obj}`);
        }

        const value = obj[prop];
        if (typeof value === 'function') {
          if (Array.isArray(obj)) {
            return (...args) => {
              if (args.length > 0 && typeof args[0] === 'function') {
                return value.call(obj, (...callbackArgs) => {
                  return args[0].apply(obj, callbackArgs);
                });
              }
              return value.apply(obj, args);
            };
          }
          return value.bind(obj);
        }
        return value;
      }

      case "FunctionDeclaration": {
        scope[node.id.name] = async function (...argsValues) {
          const fnScope = Object.create(scope);
          node.params.forEach((param, i) => {
            fnScope[param.name] = argsValues[i];
          });
          try {
            return await exec(node.body, fnScope);
          } catch (e) {
            if (e.__return) return e.value;
            throw e;
          }
        };
        return;
      }

      case "AwaitExpression": return Promise.resolve(await exec(node.argument, scope));

      case "BlockStatement": {
        for (const stmt of node.body) {
          const result = await exec(stmt, scope);
          if (result && result.__return) throw result;
        }
        return;
      }

      case "TryStatement": {
        try {
          return await exec(node.block, scope);
        } catch (err) {
          if (node.handler) {
            const newScope = Object.create(scope);
            if (node.handler.param?.name) {
              newScope[node.handler.param.name] = err;
            }
            return await exec(node.handler.body, newScope);
          }
        } finally {
          if (node.finalizer) {
            await exec(node.finalizer, scope);
          }
        }
        return;
      }

      case "ReturnStatement": throw { __return: true, value: await exec(node.argument, scope) };
      case "IfStatement": return await exec(node.test, scope) ? await exec(node.consequent, scope) : node.alternate ? await exec(node.alternate, scope) : undefined;

      case "BinaryExpression": {
        const left = await exec(node.left, scope);
        const right = await exec(node.right, scope);
        switch (node.operator) {
          case "==": return left == right;
          case "===": return left === right;
          case "!=": return left != right;
          case "!==": return left !== right;
          case "<": return left < right;
          case "<=": return left <= right;
          case ">": return left > right;
          case ">=": return left >= right;
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/": return left / right;
          case "%": return left % right;
          case 'instanceof': return left instanceof right;
          default: throw new Error(`Unsupported operator: ${node.operator}`);
        }
      }

      case "LogicalExpression": {
        const left = await exec(node.left, scope);

        switch (node.operator) {
          case "&&":
            return left ? await exec(node.right, scope) : left;
          case "||":
            return left ? left : await exec(node.right, scope);
          case "??":
            return left !== null && left !== undefined ? left : await exec(node.right, scope);
          default:
            throw new Error(`Unsupported logical operator: ${node.operator}`);
        }
      }

      case "UnaryExpression": {
        const arg = await exec(node.argument, scope);
        switch (node.operator) {
          case "!": return !arg;
          case "-": return -arg;
          case "+": return +arg;
          case "typeof": return typeof arg;
          default: throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
      }

      case "AssignmentExpression": {
        const op = node.operator;

        const getRef = async (left) => {
          if (left.type === "Identifier") return { kind: "id", name: left.name };
          if (left.type === "MemberExpression") {
            const obj = await exec(left.object, scope);
            const prop = left.computed
              ? await exec(left.property, scope)
              : left.property.name;
            return { kind: "mem", obj, prop };
          }
          return { kind: "pattern", pattern: left };
        };

        const ref = await getRef(node.left);

        if (op === "=" || ref.kind === "pattern") {
          const v = await exec(node.right, scope);
          if (ref.kind === "id") setVariable(scope, ref.name, v);
          else if (ref.kind === "mem") ref.obj[ref.prop] = v;
          else await assignPattern(ref.pattern, v, scope);
          return v;
        }

        const curr =
          ref.kind === "id" ? scope[ref.name] : ref.obj[ref.prop];
        const rhs = await exec(node.right, scope);

        let v;
        switch (op) {
          case "+=": v = curr + rhs; break;
          case "-=": v = curr - rhs; break;
          case "*=": v = curr * rhs; break;
          case "/=": v = curr / rhs; break;
          case "%=": v = curr % rhs; break;
          case "**=": v = curr ** rhs; break;
          case "<<=": v = curr << rhs; break;
          case ">>=": v = curr >> rhs; break;
          case ">>>=": v = curr >>> rhs; break;
          case "&=": v = curr & rhs; break;
          case "|=": v = curr | rhs; break;
          case "^=": v = curr ^ rhs; break;

          case "&&=": v = curr && rhs; break;
          case "||=": v = curr || rhs; break;
          case "??=":
            v = (curr ?? rhs);
            if (curr !== null && curr !== undefined) {
              return curr;
            }
            break;

          default:
            throw new Error(`Unsupported assignment operator: ${op}`);
        }

        if (ref.kind === "id") setVariable(scope, ref.name, v);
        else ref.obj[ref.prop] = v;
        return v;
      }

      case "WhileStatement":
        while (await exec(node.test, scope)) await exec(node.body, scope);
        return;

      case "BreakStatement": {
        throw { __break: true };
      }

      case "ContinueStatement": {
        throw { __continue: true };
      }

      case "ConditionalExpression": {
        const test = await exec(node.test, scope);
        return test ? await exec(node.consequent, scope) : await exec(node.alternate, scope);
      }

      case "FunctionExpression": {
        return async function (...argsValues) {
          const fnScope = Object.create(scope);
          node.params.forEach((param, i) => {
            fnScope[param.name] = argsValues[i];
          });
          try {
            return await exec(node.body, fnScope);
          } catch (e) {
            if (e.__return) return e.value;
            throw e;
          }
        };
      }

      case "ArrayExpression": {
        const result = [];
        for (const element of node.elements) {
          if (element.type === "SpreadElement") {
            const spreadValue = await exec(element.argument, scope);
            if (!isIterable(spreadValue)) {
              throw new TypeError("SpreadElement in array deve essere iterabile");
            }
            result.push(...spreadValue);
          } else {
            result.push(await exec(element, scope));
          }
        }
        Object.setPrototypeOf(result, Array.prototype);
        return result;
      }

      case "ArrowFunctionExpression": {
        const isAsync = containsAwait(node.body);
        const isBlock = node.body.type === "BlockStatement";

        if (isAsync) {
          return async (...argsValues) => {
            const fnScope = Object.create(scope);
            node.params.forEach((param, i) => { fnScope[param.name] = argsValues[i]; });
            fnScope.this = scope.this;
            try {
              return await exec(node.body, fnScope);
            } catch (e) {
              if (e && e.__return) return e.value;
              throw e;
            }
          };
        } else {
          return (...argsValues) => {
            const fnScope = Object.create(scope);
            node.params.forEach((param, i) => { fnScope[param.name] = argsValues[i]; });
            fnScope.this = scope.this;

            const p = exec(node.body, fnScope);
            return p.catch(e => (e && e.__return) ? e.value : Promise.reject(e));
          };
        }
      }


      case "ForStatement": {
        await exec(node.init, scope);
        while (await exec(node.test, scope)) {
          try {
            await exec(node.body, scope);
          } catch (e) {
            if (e.__break) break;
            throw e;
          }
          await exec(node.update, scope);
        }
        return;
      }

      case "ForOfStatement": {
        const right = await exec(node.right, scope);

        if (right == null || typeof right[Symbol.iterator] !== 'function') {
          throw new TypeError(`L'oggetto nel for...of non è iterabile`);
        }

        const iterator = right[Symbol.iterator]();

        for (const value of iterator) {
          const innerScope = Object.create(scope);

          if (node.left.type === "VariableDeclaration") {
            const decl = node.left.declarations[0];
            innerScope[decl.id.name] = value;
          } else if (node.left.type === "Identifier") {
            innerScope[node.left.name] = value;
          } else {
            throw new Error("Tipo non supportato in ForOfStatement.left");
          }

          try {
            await exec(node.body, innerScope);
          } catch (e) {
            if (e.__break) break;
            if (e.__continue) continue;
            throw e;
          }
        }

        return;
      }

      case "ObjectExpression": {
        const obj = {};
        for (const prop of node.properties) {
          if (prop.type === "SpreadElement") {
            const spreadValue = await exec(prop.argument, scope);
            if (typeof spreadValue !== "object" || spreadValue === null) {
              throw new TypeError("SpreadElement in object deve essere un oggetto");
            }
            Object.assign(obj, spreadValue);
          } else if (prop.type === "Property") {
            const key = prop.key.type === "Identifier"
              ? prop.key.name
              : await exec(prop.key, scope);
            const value = await exec(prop.value, scope);
            obj[key] = value;
          } else {
            throw new Error(`Unsupported object property type: ${prop.type}`);
          }
        }
        return obj;
      }

      case "WhileStatement":
        while (await exec(node.test, scope)) {
          try {
            await exec(node.body, scope);
          } catch (e) {
            if (e.__break) break;
            throw e;
          }
        }
        return;


      default:
        throw new Error(`Unsupported AST node type: ${node.type}`);
    }
  }

  try {
    await exec(ast, { ...baseScope });
  } catch (e) {
    if (e.__return) {
      console.log("Returned:", e.value);
    } else {
      console.error("Errore:", e);
    }
  }
}



