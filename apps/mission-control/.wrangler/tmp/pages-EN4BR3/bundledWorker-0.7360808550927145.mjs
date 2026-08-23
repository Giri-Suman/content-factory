var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../../node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../../node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../../node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../../node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../../node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x2, y2, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../../node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// _worker.js/index.js
import("node:buffer").then(({ Buffer: Buffer2 }) => {
  globalThis.Buffer = Buffer2;
}).catch(() => null);
var __ALSes_PROMISE__ = import("node:async_hooks").then(({ AsyncLocalStorage }) => {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  const envAsyncLocalStorage = new AsyncLocalStorage();
  const requestContextAsyncLocalStorage = new AsyncLocalStorage();
  globalThis.process = {
    env: new Proxy(
      {},
      {
        ownKeys: /* @__PURE__ */ __name(() => Reflect.ownKeys(envAsyncLocalStorage.getStore()), "ownKeys"),
        getOwnPropertyDescriptor: /* @__PURE__ */ __name((_2, ...args) => Reflect.getOwnPropertyDescriptor(envAsyncLocalStorage.getStore(), ...args), "getOwnPropertyDescriptor"),
        get: /* @__PURE__ */ __name((_2, property) => Reflect.get(envAsyncLocalStorage.getStore(), property), "get"),
        set: /* @__PURE__ */ __name((_2, property, value) => Reflect.set(envAsyncLocalStorage.getStore(), property, value), "set")
      }
    )
  };
  globalThis[/* @__PURE__ */ Symbol.for("__cloudflare-request-context__")] = new Proxy(
    {},
    {
      ownKeys: /* @__PURE__ */ __name(() => Reflect.ownKeys(requestContextAsyncLocalStorage.getStore()), "ownKeys"),
      getOwnPropertyDescriptor: /* @__PURE__ */ __name((_2, ...args) => Reflect.getOwnPropertyDescriptor(requestContextAsyncLocalStorage.getStore(), ...args), "getOwnPropertyDescriptor"),
      get: /* @__PURE__ */ __name((_2, property) => Reflect.get(requestContextAsyncLocalStorage.getStore(), property), "get"),
      set: /* @__PURE__ */ __name((_2, property, value) => Reflect.set(requestContextAsyncLocalStorage.getStore(), property, value), "set")
    }
  );
  return { envAsyncLocalStorage, requestContextAsyncLocalStorage };
}).catch(() => null);
var st = Object.create;
var H = Object.defineProperty;
var it = Object.getOwnPropertyDescriptor;
var at = Object.getOwnPropertyNames;
var ot = Object.getPrototypeOf;
var rt = Object.prototype.hasOwnProperty;
var M = /* @__PURE__ */ __name((t, e) => () => (t && (e = t(t = 0)), e), "M");
var V = /* @__PURE__ */ __name((t, e) => () => (e || t((e = { exports: {} }).exports, e), e.exports), "V");
var ct = /* @__PURE__ */ __name((t, e, s, n) => {
  if (e && typeof e == "object" || typeof e == "function") for (let a of at(e)) !rt.call(t, a) && a !== s && H(t, a, { get: /* @__PURE__ */ __name(() => e[a], "get"), enumerable: !(n = it(e, a)) || n.enumerable });
  return t;
}, "ct");
var q = /* @__PURE__ */ __name((t, e, s) => (s = t != null ? st(ot(t)) : {}, ct(e || !t || !t.__esModule ? H(s, "default", { value: t, enumerable: true }) : s, t)), "q");
var y;
var p = M(() => {
  y = { collectedLocales: [] };
});
var _;
var u = M(() => {
  _ = { version: 3, routes: { none: [{ src: "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$", headers: { Location: "/$1" }, status: 308, continue: true }, { src: "^/_next/__private/trace$", dest: "/404", status: 404, continue: true }, { src: "^/404/?$", status: 404, continue: true, missing: [{ type: "header", key: "x-prerender-revalidate" }] }, { src: "^/500$", status: 500, continue: true }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/(.*).json$", dest: "/$1", override: true, continue: true, has: [{ type: "header", key: "x-nextjs-data" }] }, { src: "^/index(?:/)?$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/", override: true, continue: true }, { continue: true, src: "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next\\/static|_next\\/image).*))(\\.json)?[\\/#\\?]?$", missing: [{ type: "header", key: "x-prerender-revalidate", value: "c16569f35cf566c7644033833f6430c1" }], middlewarePath: "middleware", middlewareRawSrc: ["/((?!_next/static|_next/image).*)"], override: true }, { src: "^/$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/_next/data/N2uZL240LCvI5C0sUiCDc/index.json", continue: true, override: true }, { src: "^/((?!_next/)(?:.*[^/]|.*))/?$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/_next/data/N2uZL240LCvI5C0sUiCDc/$1.json", continue: true, override: true }, { src: "^/?$", has: [{ type: "header", key: "rsc", value: "1" }], dest: "/index.rsc", headers: { vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" }, continue: true, override: true }, { src: "^/((?!.+\\.rsc).+?)(?:/)?$", has: [{ type: "header", key: "rsc", value: "1" }], dest: "/$1.rsc", headers: { vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" }, continue: true, override: true }], filesystem: [{ src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/(.*).json$", dest: "/$1", continue: true, has: [{ type: "header", key: "x-nextjs-data" }] }, { src: "^/index(?:/)?$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/", continue: true }, { src: "^/index(\\.action|\\.rsc)$", dest: "/", continue: true }, { src: "^/\\.prefetch\\.rsc$", dest: "/__index.prefetch.rsc", check: true }, { src: "^/(.+)/\\.prefetch\\.rsc$", dest: "/$1.prefetch.rsc", check: true }, { src: "^/\\.rsc$", dest: "/index.rsc", check: true }, { src: "^/(.+)/\\.rsc$", dest: "/$1.rsc", check: true }], miss: [{ src: "^/_next/static/.+$", status: 404, check: true, dest: "/_next/static/not-found.txt", headers: { "content-type": "text/plain; charset=utf-8" } }], rewrite: [{ src: "^/$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/_next/data/N2uZL240LCvI5C0sUiCDc/index.json", continue: true }, { src: "^/((?!_next/)(?:.*[^/]|.*))/?$", has: [{ type: "header", key: "x-nextjs-data" }], dest: "/_next/data/N2uZL240LCvI5C0sUiCDc/$1.json", continue: true }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/api/jobs/(?<nxtPid>[^/]+?)(?:/)?.json$", dest: "/api/jobs/[id]?nxtPid=$nxtPid" }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/api/scripts/(?<nxtPid>[^/]+?)(?:/)?.json$", dest: "/api/scripts/[id]?nxtPid=$nxtPid" }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/api/thumb/(?<nxtPid>[^/]+?)/(?<nxtPlayout>[^/]+?)(?:/)?.json$", dest: "/api/thumb/[id]/[layout]?nxtPid=$nxtPid&nxtPlayout=$nxtPlayout" }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/api/video/(?<nxtPid>[^/]+?)/(?<nxtPfile>[^/]+?)(?:/)?.json$", dest: "/api/video/[id]/[file]?nxtPid=$nxtPid&nxtPfile=$nxtPfile" }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/scripts/(?<nxtPid>[^/]+?)(?:/)?.json$", dest: "/scripts/[id]?nxtPid=$nxtPid" }, { src: "^/api/jobs/(?<nxtPid>[^/]+?)(?:\\.rsc)(?:/)?$", dest: "/api/jobs/[id].rsc?nxtPid=$nxtPid" }, { src: "^/api/jobs/(?<nxtPid>[^/]+?)(?:/)?$", dest: "/api/jobs/[id]?nxtPid=$nxtPid" }, { src: "^/api/scripts/(?<nxtPid>[^/]+?)(?:\\.rsc)(?:/)?$", dest: "/api/scripts/[id].rsc?nxtPid=$nxtPid" }, { src: "^/api/scripts/(?<nxtPid>[^/]+?)(?:/)?$", dest: "/api/scripts/[id]?nxtPid=$nxtPid" }, { src: "^/api/thumb/(?<nxtPid>[^/]+?)/(?<nxtPlayout>[^/]+?)(?:\\.rsc)(?:/)?$", dest: "/api/thumb/[id]/[layout].rsc?nxtPid=$nxtPid&nxtPlayout=$nxtPlayout" }, { src: "^/api/thumb/(?<nxtPid>[^/]+?)/(?<nxtPlayout>[^/]+?)(?:/)?$", dest: "/api/thumb/[id]/[layout]?nxtPid=$nxtPid&nxtPlayout=$nxtPlayout" }, { src: "^/api/video/(?<nxtPid>[^/]+?)/(?<nxtPfile>[^/]+?)(?:\\.rsc)(?:/)?$", dest: "/api/video/[id]/[file].rsc?nxtPid=$nxtPid&nxtPfile=$nxtPfile" }, { src: "^/api/video/(?<nxtPid>[^/]+?)/(?<nxtPfile>[^/]+?)(?:/)?$", dest: "/api/video/[id]/[file]?nxtPid=$nxtPid&nxtPfile=$nxtPfile" }, { src: "^/scripts/(?<nxtPid>[^/]+?)(?:\\.rsc)(?:/)?$", dest: "/scripts/[id].rsc?nxtPid=$nxtPid" }, { src: "^/scripts/(?<nxtPid>[^/]+?)(?:/)?$", dest: "/scripts/[id]?nxtPid=$nxtPid" }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/(.*).json$", headers: { "x-nextjs-matched-path": "/$1" }, continue: true, override: true }, { src: "^/_next/data/N2uZL240LCvI5C0sUiCDc/(.*).json$", dest: "__next_data_catchall" }], resource: [{ src: "^/.*$", status: 404 }], hit: [{ src: "^/_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media|N2uZL240LCvI5C0sUiCDc)/.+$", headers: { "cache-control": "public,max-age=31536000,immutable" }, continue: true, important: true }, { src: "^/index(?:/)?$", headers: { "x-matched-path": "/" }, continue: true, important: true }, { src: "^/((?!index$).*?)(?:/)?$", headers: { "x-matched-path": "/$1" }, continue: true, important: true }], error: [{ src: "^/.*$", dest: "/404", status: 404 }, { src: "^/.*$", dest: "/500", status: 500 }] }, images: { domains: [], sizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840, 16, 32, 48, 64, 96, 128, 256, 384], remotePatterns: [], minimumCacheTTL: 60, formats: ["image/webp"], dangerouslyAllowSVG: false, contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;", contentDispositionType: "attachment" }, overrides: { "404.html": { path: "404", contentType: "text/html; charset=utf-8" }, "500.html": { path: "500", contentType: "text/html; charset=utf-8" }, "_app.rsc.json": { path: "_app.rsc", contentType: "application/json" }, "_error.rsc.json": { path: "_error.rsc", contentType: "application/json" }, "_document.rsc.json": { path: "_document.rsc", contentType: "application/json" }, "404.rsc.json": { path: "404.rsc", contentType: "application/json" }, "__next_data_catchall.json": { path: "__next_data_catchall", contentType: "application/json" }, "_next/static/not-found.txt": { contentType: "text/plain" } }, framework: { version: "15.5.2" }, crons: [] };
});
var h;
var d = M(() => {
  h = { "/404.html": { type: "override", path: "/404.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/404.rsc.json": { type: "override", path: "/404.rsc.json", headers: { "content-type": "application/json" } }, "/500.html": { type: "override", path: "/500.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/__next_data_catchall.json": { type: "override", path: "/__next_data_catchall.json", headers: { "content-type": "application/json" } }, "/_app.rsc.json": { type: "override", path: "/_app.rsc.json", headers: { "content-type": "application/json" } }, "/_document.rsc.json": { type: "override", path: "/_document.rsc.json", headers: { "content-type": "application/json" } }, "/_error.rsc.json": { type: "override", path: "/_error.rsc.json", headers: { "content-type": "application/json" } }, "/_next/static/N2uZL240LCvI5C0sUiCDc/_buildManifest.js": { type: "static" }, "/_next/static/N2uZL240LCvI5C0sUiCDc/_ssgManifest.js": { type: "static" }, "/_next/static/chunks/18-ef38cc2f87045b34.js": { type: "static" }, "/_next/static/chunks/2128-ba8351ed675c3fc9.js": { type: "static" }, "/_next/static/chunks/87c73c54-24122e7b92478d00.js": { type: "static" }, "/_next/static/chunks/9664-af80478aa73ba424.js": { type: "static" }, "/_next/static/chunks/app/_not-found/page-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/analytics/page-7ff32869b1fade49.js": { type: "static" }, "/_next/static/chunks/app/api/analytics/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/autoedit/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/backup/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/briefs/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/catalog/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/center/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/clusters/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/cost/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/draft/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/ideas/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/jobs/[id]/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/keywords/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/lab/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/lessons/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/login/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/math/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/motion/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/playbooks/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/production/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/publish/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/qc/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/render/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/renders/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/run/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/scripts/[id]/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/scripts/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/settings/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/shorts/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/thumb/[id]/[layout]/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/thumbnails/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/today/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/tools/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/trends/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/upload/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/video/[id]/[file]/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/wishlist/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/api/youtube/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/briefs/page-33ccde5925ce525e.js": { type: "static" }, "/_next/static/chunks/app/catalog/page-cd7812c242053bbb.js": { type: "static" }, "/_next/static/chunks/app/cost/page-b3b40a0b1f29c2be.js": { type: "static" }, "/_next/static/chunks/app/footage/page-9c0854caf24c5a5e.js": { type: "static" }, "/_next/static/chunks/app/ideas/page-89b509c6336e9241.js": { type: "static" }, "/_next/static/chunks/app/keywords/page-a2c732e79db65259.js": { type: "static" }, "/_next/static/chunks/app/lab/page-7d76fed381a58010.js": { type: "static" }, "/_next/static/chunks/app/layout-ad8db6e417b57689.js": { type: "static" }, "/_next/static/chunks/app/lessons/page-4f2022acd1a5b3a6.js": { type: "static" }, "/_next/static/chunks/app/login/page-38126687f59558fe.js": { type: "static" }, "/_next/static/chunks/app/math/page-2f86546c58701b83.js": { type: "static" }, "/_next/static/chunks/app/motion/page-ec4d9a30870d16f3.js": { type: "static" }, "/_next/static/chunks/app/not-found-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/packaging/page-63a34e729c3ac29b.js": { type: "static" }, "/_next/static/chunks/app/page-6e1677d9681b5793.js": { type: "static" }, "/_next/static/chunks/app/playbooks/page-8c762b322889aa7f.js": { type: "static" }, "/_next/static/chunks/app/production/page-595960dbb151f0d0.js": { type: "static" }, "/_next/static/chunks/app/publish/page-bd9983c8fda7266d.js": { type: "static" }, "/_next/static/chunks/app/qc/page-4379524a7d7fb3a4.js": { type: "static" }, "/_next/static/chunks/app/renders/page-16cc51a6d73e96a7.js": { type: "static" }, "/_next/static/chunks/app/robots.txt/route-7be5d08906682a0c.js": { type: "static" }, "/_next/static/chunks/app/scripts/[id]/page-8ff8c7b5c7934c68.js": { type: "static" }, "/_next/static/chunks/app/scripts/page-d750123678f11543.js": { type: "static" }, "/_next/static/chunks/app/settings/page-58159166bcc4ceae.js": { type: "static" }, "/_next/static/chunks/app/studio/page-961d64eeefbea53d.js": { type: "static" }, "/_next/static/chunks/app/tools/page-20fe327a89f6d5a2.js": { type: "static" }, "/_next/static/chunks/app/trends/page-b1e2f26869ce34b5.js": { type: "static" }, "/_next/static/chunks/app/wishlist/page-7c5715854902e00c.js": { type: "static" }, "/_next/static/chunks/app/youtube/page-e04e24b57d9e05f9.js": { type: "static" }, "/_next/static/chunks/framework-8cbae44638a30474.js": { type: "static" }, "/_next/static/chunks/main-728ef2662053b681.js": { type: "static" }, "/_next/static/chunks/main-app-f604d8ec41986904.js": { type: "static" }, "/_next/static/chunks/pages/_app-50fa07b56b2d29ac.js": { type: "static" }, "/_next/static/chunks/pages/_error-fed8688bdd23f211.js": { type: "static" }, "/_next/static/chunks/polyfills-42372ed130431b0a.js": { type: "static" }, "/_next/static/chunks/webpack-07eb0afe258e0f90.js": { type: "static" }, "/_next/static/css/37bae92d3c5bf748.css": { type: "static" }, "/_next/static/not-found.txt": { type: "static" }, "/analytics": { type: "function", entrypoint: "__next-on-pages-dist__/functions/analytics.func.js" }, "/analytics.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/analytics.func.js" }, "/api/analytics": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/analytics.func.js" }, "/api/analytics.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/analytics.func.js" }, "/api/autoedit": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/autoedit.func.js" }, "/api/autoedit.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/autoedit.func.js" }, "/api/backup": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/backup.func.js" }, "/api/backup.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/backup.func.js" }, "/api/briefs": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/briefs.func.js" }, "/api/briefs.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/briefs.func.js" }, "/api/catalog": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/catalog.func.js" }, "/api/catalog.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/catalog.func.js" }, "/api/center": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/center.func.js" }, "/api/center.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/center.func.js" }, "/api/clusters": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/clusters.func.js" }, "/api/clusters.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/clusters.func.js" }, "/api/cost": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/cost.func.js" }, "/api/cost.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/cost.func.js" }, "/api/draft": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/draft.func.js" }, "/api/draft.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/draft.func.js" }, "/api/ideas": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/ideas.func.js" }, "/api/ideas.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/ideas.func.js" }, "/api/jobs/[id]": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/jobs/[id].func.js" }, "/api/jobs/[id].rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/jobs/[id].func.js" }, "/api/keywords": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/keywords.func.js" }, "/api/keywords.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/keywords.func.js" }, "/api/lab": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/lab.func.js" }, "/api/lab.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/lab.func.js" }, "/api/lessons": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/lessons.func.js" }, "/api/lessons.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/lessons.func.js" }, "/api/login": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/login.func.js" }, "/api/login.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/login.func.js" }, "/api/math": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/math.func.js" }, "/api/math.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/math.func.js" }, "/api/motion": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/motion.func.js" }, "/api/motion.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/motion.func.js" }, "/api/playbooks": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/playbooks.func.js" }, "/api/playbooks.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/playbooks.func.js" }, "/api/production": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/production.func.js" }, "/api/production.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/production.func.js" }, "/api/publish": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/publish.func.js" }, "/api/publish.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/publish.func.js" }, "/api/qc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/qc.func.js" }, "/api/qc.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/qc.func.js" }, "/api/render": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/render.func.js" }, "/api/render.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/render.func.js" }, "/api/renders": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/renders.func.js" }, "/api/renders.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/renders.func.js" }, "/api/run": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/run.func.js" }, "/api/run.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/run.func.js" }, "/api/scripts/[id]": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/scripts/[id].func.js" }, "/api/scripts/[id].rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/scripts/[id].func.js" }, "/api/scripts": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/scripts.func.js" }, "/api/scripts.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/scripts.func.js" }, "/api/settings": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/settings.func.js" }, "/api/settings.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/settings.func.js" }, "/api/shorts": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/shorts.func.js" }, "/api/shorts.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/shorts.func.js" }, "/api/thumb/[id]/[layout]": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/thumb/[id]/[layout].func.js" }, "/api/thumb/[id]/[layout].rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/thumb/[id]/[layout].func.js" }, "/api/thumbnails": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/thumbnails.func.js" }, "/api/thumbnails.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/thumbnails.func.js" }, "/api/today": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/today.func.js" }, "/api/today.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/today.func.js" }, "/api/tools": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/tools.func.js" }, "/api/tools.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/tools.func.js" }, "/api/trends": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/trends.func.js" }, "/api/trends.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/trends.func.js" }, "/api/upload": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/upload.func.js" }, "/api/upload.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/upload.func.js" }, "/api/video/[id]/[file]": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/video/[id]/[file].func.js" }, "/api/video/[id]/[file].rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/video/[id]/[file].func.js" }, "/api/wishlist": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/wishlist.func.js" }, "/api/wishlist.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/wishlist.func.js" }, "/api/youtube": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/youtube.func.js" }, "/api/youtube.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/api/youtube.func.js" }, "/briefs": { type: "function", entrypoint: "__next-on-pages-dist__/functions/briefs.func.js" }, "/briefs.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/briefs.func.js" }, "/catalog": { type: "function", entrypoint: "__next-on-pages-dist__/functions/catalog.func.js" }, "/catalog.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/catalog.func.js" }, "/cost": { type: "function", entrypoint: "__next-on-pages-dist__/functions/cost.func.js" }, "/cost.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/cost.func.js" }, "/footage": { type: "function", entrypoint: "__next-on-pages-dist__/functions/footage.func.js" }, "/footage.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/footage.func.js" }, "/ideas": { type: "function", entrypoint: "__next-on-pages-dist__/functions/ideas.func.js" }, "/ideas.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/ideas.func.js" }, "/index": { type: "function", entrypoint: "__next-on-pages-dist__/functions/index.func.js" }, "/": { type: "function", entrypoint: "__next-on-pages-dist__/functions/index.func.js" }, "/index.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/index.func.js" }, "/keywords": { type: "function", entrypoint: "__next-on-pages-dist__/functions/keywords.func.js" }, "/keywords.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/keywords.func.js" }, "/lab": { type: "function", entrypoint: "__next-on-pages-dist__/functions/lab.func.js" }, "/lab.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/lab.func.js" }, "/lessons": { type: "function", entrypoint: "__next-on-pages-dist__/functions/lessons.func.js" }, "/lessons.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/lessons.func.js" }, "/login": { type: "function", entrypoint: "__next-on-pages-dist__/functions/login.func.js" }, "/login.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/login.func.js" }, "/math": { type: "function", entrypoint: "__next-on-pages-dist__/functions/math.func.js" }, "/math.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/math.func.js" }, "/motion": { type: "function", entrypoint: "__next-on-pages-dist__/functions/motion.func.js" }, "/motion.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/motion.func.js" }, "/packaging": { type: "function", entrypoint: "__next-on-pages-dist__/functions/packaging.func.js" }, "/packaging.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/packaging.func.js" }, "/playbooks": { type: "function", entrypoint: "__next-on-pages-dist__/functions/playbooks.func.js" }, "/playbooks.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/playbooks.func.js" }, "/production": { type: "function", entrypoint: "__next-on-pages-dist__/functions/production.func.js" }, "/production.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/production.func.js" }, "/publish": { type: "function", entrypoint: "__next-on-pages-dist__/functions/publish.func.js" }, "/publish.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/publish.func.js" }, "/qc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/qc.func.js" }, "/qc.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/qc.func.js" }, "/renders": { type: "function", entrypoint: "__next-on-pages-dist__/functions/renders.func.js" }, "/renders.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/renders.func.js" }, "/scripts/[id]": { type: "function", entrypoint: "__next-on-pages-dist__/functions/scripts/[id].func.js" }, "/scripts/[id].rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/scripts/[id].func.js" }, "/scripts": { type: "function", entrypoint: "__next-on-pages-dist__/functions/scripts.func.js" }, "/scripts.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/scripts.func.js" }, "/settings": { type: "function", entrypoint: "__next-on-pages-dist__/functions/settings.func.js" }, "/settings.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/settings.func.js" }, "/studio": { type: "function", entrypoint: "__next-on-pages-dist__/functions/studio.func.js" }, "/studio.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/studio.func.js" }, "/tools": { type: "function", entrypoint: "__next-on-pages-dist__/functions/tools.func.js" }, "/tools.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/tools.func.js" }, "/trends": { type: "function", entrypoint: "__next-on-pages-dist__/functions/trends.func.js" }, "/trends.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/trends.func.js" }, "/wishlist": { type: "function", entrypoint: "__next-on-pages-dist__/functions/wishlist.func.js" }, "/wishlist.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/wishlist.func.js" }, "/youtube": { type: "function", entrypoint: "__next-on-pages-dist__/functions/youtube.func.js" }, "/youtube.rsc": { type: "function", entrypoint: "__next-on-pages-dist__/functions/youtube.func.js" }, "/404": { type: "override", path: "/404.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/500": { type: "override", path: "/500.html", headers: { "content-type": "text/html; charset=utf-8" } }, "/_app.rsc": { type: "override", path: "/_app.rsc.json", headers: { "content-type": "application/json" } }, "/_error.rsc": { type: "override", path: "/_error.rsc.json", headers: { "content-type": "application/json" } }, "/_document.rsc": { type: "override", path: "/_document.rsc.json", headers: { "content-type": "application/json" } }, "/404.rsc": { type: "override", path: "/404.rsc.json", headers: { "content-type": "application/json" } }, "/__next_data_catchall": { type: "override", path: "/__next_data_catchall.json", headers: { "content-type": "application/json" } }, "/_not-found.html": { type: "override", path: "/_not-found.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_not-found": { type: "override", path: "/_not-found.html", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, "/_not-found.rsc": { type: "override", path: "/_not-found.rsc", headers: { "x-nextjs-stale-time": "300", "x-nextjs-prerender": "1", "x-next-cache-tags": "_N_T_/layout,_N_T_/_not-found/layout,_N_T_/_not-found/page,_N_T_/_not-found", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch", "content-type": "text/x-component" } }, "/robots.txt": { type: "override", path: "/robots.txt", headers: { "cache-control": "public, max-age=0, must-revalidate", "content-type": "text/plain", "x-next-cache-tags": "_N_T_/layout,_N_T_/robots.txt/layout,_N_T_/robots.txt/route,_N_T_/robots.txt", vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch" } }, middleware: { type: "middleware", entrypoint: "__next-on-pages-dist__/functions/middleware.func.js" } };
});
var F = V((zt, $) => {
  "use strict";
  p();
  u();
  d();
  function b(t, e) {
    t = String(t || "").trim();
    let s = t, n, a = "";
    if (/^[^a-zA-Z\\\s]/.test(t)) {
      n = t[0];
      let r = t.lastIndexOf(n);
      a += t.substring(r + 1), t = t.substring(1, r);
    }
    let i = 0;
    return t = dt(t, (r) => {
      if (/^\(\?[P<']/.test(r)) {
        let c = /^\(\?P?[<']([^>']+)[>']/.exec(r);
        if (!c) throw new Error(`Failed to extract named captures from ${JSON.stringify(r)}`);
        let f = r.substring(c[0].length, r.length - 1);
        return e && (e[i] = c[1]), i++, `(${f})`;
      }
      return r.substring(0, 3) === "(?:" || i++, r;
    }), t = t.replace(/\[:([^:]+):\]/g, (r, c) => b.characterClasses[c] || r), new b.PCRE(t, a, s, a, n);
  }
  __name(b, "b");
  function dt(t, e) {
    let s = 0, n = 0, a = false;
    for (let o = 0; o < t.length; o++) {
      let i = t[o];
      if (a) {
        a = false;
        continue;
      }
      switch (i) {
        case "(":
          n === 0 && (s = o), n++;
          break;
        case ")":
          if (n > 0 && (n--, n === 0)) {
            let r = o + 1, c = s === 0 ? "" : t.substring(0, s), f = t.substring(r), l = String(e(t.substring(s, r)));
            t = c + l + f, o = s;
          }
          break;
        case "\\":
          a = true;
          break;
        default:
          break;
      }
    }
    return t;
  }
  __name(dt, "dt");
  (function(t) {
    class e extends RegExp {
      static {
        __name(this, "e");
      }
      constructor(n, a, o, i, r) {
        super(n, a), this.pcrePattern = o, this.pcreFlags = i, this.delimiter = r;
      }
    }
    t.PCRE = e, t.characterClasses = { alnum: "[A-Za-z0-9]", word: "[A-Za-z0-9_]", alpha: "[A-Za-z]", blank: "[ \\t]", cntrl: "[\\x00-\\x1F\\x7F]", digit: "\\d", graph: "[\\x21-\\x7E]", lower: "[a-z]", print: "[\\x20-\\x7E]", punct: "[\\]\\[!\"#$%&'()*+,./:;<=>?@\\\\^_`{|}~-]", space: "\\s", upper: "[A-Z]", xdigit: "[A-Fa-f0-9]" };
  })(b || (b = {}));
  b.prototype = b.PCRE.prototype;
  $.exports = b;
});
var Q = V((U) => {
  "use strict";
  p();
  u();
  d();
  U.parse = Rt;
  U.serialize = kt;
  var wt = Object.prototype.toString, E = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
  function Rt(t, e) {
    if (typeof t != "string") throw new TypeError("argument str must be a string");
    for (var s = {}, n = e || {}, a = n.decode || vt, o = 0; o < t.length; ) {
      var i = t.indexOf("=", o);
      if (i === -1) break;
      var r = t.indexOf(";", o);
      if (r === -1) r = t.length;
      else if (r < i) {
        o = t.lastIndexOf(";", i - 1) + 1;
        continue;
      }
      var c = t.slice(o, i).trim();
      if (s[c] === void 0) {
        var f = t.slice(i + 1, r).trim();
        f.charCodeAt(0) === 34 && (f = f.slice(1, -1)), s[c] = Ct(f, a);
      }
      o = r + 1;
    }
    return s;
  }
  __name(Rt, "Rt");
  function kt(t, e, s) {
    var n = s || {}, a = n.encode || Pt;
    if (typeof a != "function") throw new TypeError("option encode is invalid");
    if (!E.test(t)) throw new TypeError("argument name is invalid");
    var o = a(e);
    if (o && !E.test(o)) throw new TypeError("argument val is invalid");
    var i = t + "=" + o;
    if (n.maxAge != null) {
      var r = n.maxAge - 0;
      if (isNaN(r) || !isFinite(r)) throw new TypeError("option maxAge is invalid");
      i += "; Max-Age=" + Math.floor(r);
    }
    if (n.domain) {
      if (!E.test(n.domain)) throw new TypeError("option domain is invalid");
      i += "; Domain=" + n.domain;
    }
    if (n.path) {
      if (!E.test(n.path)) throw new TypeError("option path is invalid");
      i += "; Path=" + n.path;
    }
    if (n.expires) {
      var c = n.expires;
      if (!St(c) || isNaN(c.valueOf())) throw new TypeError("option expires is invalid");
      i += "; Expires=" + c.toUTCString();
    }
    if (n.httpOnly && (i += "; HttpOnly"), n.secure && (i += "; Secure"), n.priority) {
      var f = typeof n.priority == "string" ? n.priority.toLowerCase() : n.priority;
      switch (f) {
        case "low":
          i += "; Priority=Low";
          break;
        case "medium":
          i += "; Priority=Medium";
          break;
        case "high":
          i += "; Priority=High";
          break;
        default:
          throw new TypeError("option priority is invalid");
      }
    }
    if (n.sameSite) {
      var l = typeof n.sameSite == "string" ? n.sameSite.toLowerCase() : n.sameSite;
      switch (l) {
        case true:
          i += "; SameSite=Strict";
          break;
        case "lax":
          i += "; SameSite=Lax";
          break;
        case "strict":
          i += "; SameSite=Strict";
          break;
        case "none":
          i += "; SameSite=None";
          break;
        default:
          throw new TypeError("option sameSite is invalid");
      }
    }
    return i;
  }
  __name(kt, "kt");
  function vt(t) {
    return t.indexOf("%") !== -1 ? decodeURIComponent(t) : t;
  }
  __name(vt, "vt");
  function Pt(t) {
    return encodeURIComponent(t);
  }
  __name(Pt, "Pt");
  function St(t) {
    return wt.call(t) === "[object Date]" || t instanceof Date;
  }
  __name(St, "St");
  function Ct(t, e) {
    try {
      return e(t);
    } catch {
      return t;
    }
  }
  __name(Ct, "Ct");
});
p();
u();
d();
p();
u();
d();
p();
u();
d();
var w = "INTERNAL_SUSPENSE_CACHE_HOSTNAME.local";
p();
u();
d();
p();
u();
d();
p();
u();
d();
p();
u();
d();
var D = q(F());
function P(t, e, s) {
  if (e == null) return { match: null, captureGroupKeys: [] };
  let n = s ? "" : "i", a = [];
  return { match: (0, D.default)(`%${t}%${n}`, a).exec(e), captureGroupKeys: a };
}
__name(P, "P");
function R(t, e, s, { namedOnly: n } = {}) {
  return t.replace(/\$([a-zA-Z0-9_]+)/g, (a, o) => {
    let i = s.indexOf(o);
    return n && i === -1 ? a : (i === -1 ? e[parseInt(o, 10)] : e[i + 1]) || "";
  });
}
__name(R, "R");
function N(t, { url: e, cookies: s, headers: n, routeDest: a }) {
  switch (t.type) {
    case "host":
      return { valid: e.hostname === t.value };
    case "header":
      return t.value !== void 0 ? I(t.value, n.get(t.key), a) : { valid: n.has(t.key) };
    case "cookie": {
      let o = s[t.key];
      return o && t.value !== void 0 ? I(t.value, o, a) : { valid: o !== void 0 };
    }
    case "query":
      return t.value !== void 0 ? I(t.value, e.searchParams.get(t.key), a) : { valid: e.searchParams.has(t.key) };
  }
}
__name(N, "N");
function I(t, e, s) {
  let { match: n, captureGroupKeys: a } = P(t, e);
  return s && n && a.length ? { valid: !!n, newRouteDest: R(s, n, a, { namedOnly: true }) } : { valid: !!n };
}
__name(I, "I");
p();
u();
d();
function B(t) {
  let e = new Headers(t.headers);
  return t.cf && (e.set("x-vercel-ip-city", encodeURIComponent(t.cf.city)), e.set("x-vercel-ip-country", t.cf.country), e.set("x-vercel-ip-country-region", t.cf.regionCode), e.set("x-vercel-ip-latitude", t.cf.latitude), e.set("x-vercel-ip-longitude", t.cf.longitude)), e.set("x-vercel-sc-host", w), new Request(t, { headers: e });
}
__name(B, "B");
p();
u();
d();
function x(t, e, s) {
  let n = e instanceof Headers ? e.entries() : Object.entries(e);
  for (let [a, o] of n) {
    let i = a.toLowerCase(), r = s?.match ? R(o, s.match, s.captureGroupKeys) : o;
    i === "set-cookie" ? t.append(i, r) : t.set(i, r);
  }
}
__name(x, "x");
function k(t) {
  return /^https?:\/\//.test(t);
}
__name(k, "k");
function m(t, e) {
  for (let [s, n] of e.entries()) {
    let a = /^nxtP(.+)$/.exec(s), o = /^nxtI(.+)$/.exec(s);
    a?.[1] ? (t.set(s, n), t.set(a[1], n)) : o?.[1] ? t.set(o[1], n.replace(/(\(\.+\))+/, "")) : (!t.has(s) || !!n && !t.getAll(s).includes(n)) && t.append(s, n);
  }
}
__name(m, "m");
function L(t, e) {
  let s = new URL(e, t.url);
  return m(s.searchParams, new URL(t.url).searchParams), s.pathname = s.pathname.replace(/\/index.html$/, "/").replace(/\.html$/, ""), new Request(s, t);
}
__name(L, "L");
function v(t) {
  return new Response(t.body, t);
}
__name(v, "v");
function A(t) {
  return t.split(",").map((e) => {
    let [s, n] = e.split(";"), a = parseFloat((n ?? "q=1").replace(/q *= */gi, ""));
    return [s.trim(), isNaN(a) ? 1 : a];
  }).sort((e, s) => s[1] - e[1]).map(([e]) => e === "*" || e === "" ? [] : e).flat();
}
__name(A, "A");
p();
u();
d();
function O(t) {
  switch (t) {
    case "none":
      return "filesystem";
    case "filesystem":
      return "rewrite";
    case "rewrite":
      return "resource";
    case "resource":
      return "miss";
    default:
      return "miss";
  }
}
__name(O, "O");
async function S(t, { request: e, assetsFetcher: s, ctx: n }, { path: a, searchParams: o }) {
  let i, r = new URL(e.url);
  m(r.searchParams, o);
  let c = new Request(r, e);
  try {
    switch (t?.type) {
      case "function":
      case "middleware": {
        let f = await import(t.entrypoint);
        try {
          i = await f.default(c, n);
        } catch (l) {
          let g = l;
          throw g.name === "TypeError" && g.message.endsWith("default is not a function") ? new Error(`An error occurred while evaluating the target edge function (${t.entrypoint})`) : l;
        }
        break;
      }
      case "override": {
        i = v(await s.fetch(L(c, t.path ?? a))), t.headers && x(i.headers, t.headers);
        break;
      }
      case "static": {
        i = await s.fetch(L(c, a));
        break;
      }
      default:
        i = new Response("Not Found", { status: 404 });
    }
  } catch (f) {
    return console.error(f), new Response("Internal Server Error", { status: 500 });
  }
  return v(i);
}
__name(S, "S");
function G(t, e) {
  let s = "^//?(?:", n = ")/(.*)$";
  return !t.startsWith(s) || !t.endsWith(n) ? false : t.slice(s.length, -n.length).split("|").every((o) => e.has(o));
}
__name(G, "G");
p();
u();
d();
function ft(t, { protocol: e, hostname: s, port: n, pathname: a }) {
  return !(e && t.protocol.replace(/:$/, "") !== e || !new RegExp(s).test(t.hostname) || n && !new RegExp(n).test(t.port) || a && !new RegExp(a).test(t.pathname));
}
__name(ft, "ft");
function lt(t, e) {
  if (t.method !== "GET") return;
  let { origin: s, searchParams: n } = new URL(t.url), a = n.get("url"), o = Number.parseInt(n.get("w") ?? "", 10), i = Number.parseInt(n.get("q") ?? "75", 10);
  if (!a || Number.isNaN(o) || Number.isNaN(i) || !e?.sizes?.includes(o) || i < 0 || i > 100) return;
  let r = new URL(a, s);
  if (r.pathname.endsWith(".svg") && !e?.dangerouslyAllowSVG) return;
  let c = a.startsWith("//"), f = a.startsWith("/") && !c;
  if (!f && !e?.domains?.includes(r.hostname) && !e?.remotePatterns?.find((j) => ft(r, j))) return;
  let l = t.headers.get("Accept") ?? "", g = e?.formats?.find((j) => l.includes(j))?.replace("image/", "");
  return { isRelative: f, imageUrl: r, options: { width: o, quality: i, format: g } };
}
__name(lt, "lt");
function _t(t, e, s) {
  let n = new Headers();
  if (s?.contentSecurityPolicy && n.set("Content-Security-Policy", s.contentSecurityPolicy), s?.contentDispositionType) {
    let o = e.pathname.split("/").pop(), i = o ? `${s.contentDispositionType}; filename="${o}"` : s.contentDispositionType;
    n.set("Content-Disposition", i);
  }
  t.headers.has("Cache-Control") || n.set("Cache-Control", `public, max-age=${s?.minimumCacheTTL ?? 60}`);
  let a = v(t);
  return x(a.headers, n), a;
}
__name(_t, "_t");
async function K(t, { buildOutput: e, assetsFetcher: s, imagesConfig: n }) {
  let a = lt(t, n);
  if (!a) return new Response("Invalid image resizing request", { status: 400 });
  let { isRelative: o, imageUrl: i } = a, c = await (o && i.pathname in e ? s.fetch.bind(s) : fetch)(i);
  return _t(c, i, n);
}
__name(K, "K");
p();
u();
d();
p();
u();
d();
p();
u();
d();
async function C(t) {
  return import(t);
}
__name(C, "C");
var ht = "x-vercel-cache-tags";
var yt = "x-next-cache-soft-tags";
var gt = /* @__PURE__ */ Symbol.for("__cloudflare-request-context__");
async function J(t) {
  let e = `https://${w}/v1/suspense-cache/`;
  if (!t.url.startsWith(e)) return null;
  try {
    let s = new URL(t.url), n = await xt();
    if (s.pathname === "/v1/suspense-cache/revalidate") {
      let o = s.searchParams.get("tags")?.split(",") ?? [];
      for (let i of o) await n.revalidateTag(i);
      return new Response(null, { status: 200 });
    }
    let a = s.pathname.replace("/v1/suspense-cache/", "");
    if (!a.length) return new Response("Invalid cache key", { status: 400 });
    switch (t.method) {
      case "GET": {
        let o = z(t, yt), i = await n.get(a, { softTags: o });
        return i ? new Response(JSON.stringify(i.value), { status: 200, headers: { "Content-Type": "application/json", "x-vercel-cache-state": "fresh", age: `${(Date.now() - (i.lastModified ?? Date.now())) / 1e3}` } }) : new Response(null, { status: 404 });
      }
      case "POST": {
        let o = globalThis[gt], i = /* @__PURE__ */ __name(async () => {
          let r = await t.json();
          r.data.tags === void 0 && (r.tags ??= z(t, ht) ?? []), await n.set(a, r);
        }, "i");
        return o ? o.ctx.waitUntil(i()) : await i(), new Response(null, { status: 200 });
      }
      default:
        return new Response(null, { status: 405 });
    }
  } catch (s) {
    return console.error(s), new Response("Error handling cache request", { status: 500 });
  }
}
__name(J, "J");
async function xt() {
  return process.env.__NEXT_ON_PAGES__KV_SUSPENSE_CACHE ? W("kv") : W("cache-api");
}
__name(xt, "xt");
async function W(t) {
  let e = `./__next-on-pages-dist__/cache/${t}.js`, s = await C(e);
  return new s.default();
}
__name(W, "W");
function z(t, e) {
  return t.headers.get(e)?.split(",")?.filter(Boolean);
}
__name(z, "z");
function X() {
  globalThis[Z] || (mt(), globalThis[Z] = true);
}
__name(X, "X");
function mt() {
  let t = globalThis.fetch;
  globalThis.fetch = async (...e) => {
    let s = new Request(...e), n = await bt(s);
    return n || (n = await J(s), n) ? n : (jt(s), t(s));
  };
}
__name(mt, "mt");
async function bt(t) {
  if (t.url.startsWith("blob:")) try {
    let s = `./__next-on-pages-dist__/assets/${new URL(t.url).pathname}.bin`, n = (await C(s)).default, a = { async arrayBuffer() {
      return n;
    }, get body() {
      return new ReadableStream({ start(o) {
        let i = Buffer.from(n);
        o.enqueue(i), o.close();
      } });
    }, async text() {
      return Buffer.from(n).toString();
    }, async json() {
      let o = Buffer.from(n);
      return JSON.stringify(o.toString());
    }, async blob() {
      return new Blob(n);
    } };
    return a.clone = () => ({ ...a }), a;
  } catch {
  }
  return null;
}
__name(bt, "bt");
function jt(t) {
  t.headers.has("user-agent") || t.headers.set("user-agent", "Next.js Middleware");
}
__name(jt, "jt");
var Z = /* @__PURE__ */ Symbol.for("next-on-pages fetch patch");
p();
u();
d();
var Y = q(Q());
var T = class {
  static {
    __name(this, "T");
  }
  constructor(e, s, n, a, o) {
    this.routes = e;
    this.output = s;
    this.reqCtx = n;
    this.url = new URL(n.request.url), this.cookies = (0, Y.parse)(n.request.headers.get("cookie") || ""), this.path = this.url.pathname || "/", this.headers = { normal: new Headers(), important: new Headers() }, this.searchParams = new URLSearchParams(), m(this.searchParams, this.url.searchParams), this.checkPhaseCounter = 0, this.middlewareInvoked = [], this.wildcardMatch = o?.find((i) => i.domain === this.url.hostname), this.locales = new Set(a.collectedLocales);
  }
  url;
  cookies;
  wildcardMatch;
  path;
  status;
  headers;
  searchParams;
  body;
  checkPhaseCounter;
  middlewareInvoked;
  locales;
  checkRouteMatch(e, { checkStatus: s, checkIntercept: n }) {
    let a = P(e.src, this.path, e.caseSensitive);
    if (!a.match || e.methods && !e.methods.map((i) => i.toUpperCase()).includes(this.reqCtx.request.method.toUpperCase())) return;
    let o = { url: this.url, cookies: this.cookies, headers: this.reqCtx.request.headers, routeDest: e.dest };
    if (!e.has?.find((i) => {
      let r = N(i, o);
      return r.newRouteDest && (o.routeDest = r.newRouteDest), !r.valid;
    }) && !e.missing?.find((i) => N(i, o).valid) && !(s && e.status !== this.status)) {
      if (n && e.dest) {
        let i = /\/(\(\.+\))+/, r = i.test(e.dest), c = i.test(this.path);
        if (r && !c) return;
      }
      return { routeMatch: a, routeDest: o.routeDest };
    }
  }
  processMiddlewareResp(e) {
    let s = "x-middleware-override-headers", n = e.headers.get(s);
    if (n) {
      let c = new Set(n.split(",").map((f) => f.trim()));
      for (let f of c.keys()) {
        let l = `x-middleware-request-${f}`, g = e.headers.get(l);
        this.reqCtx.request.headers.get(f) !== g && (g ? this.reqCtx.request.headers.set(f, g) : this.reqCtx.request.headers.delete(f)), e.headers.delete(l);
      }
      e.headers.delete(s);
    }
    let a = "x-middleware-rewrite", o = e.headers.get(a);
    if (o) {
      let c = new URL(o, this.url), f = this.url.hostname !== c.hostname;
      this.path = f ? `${c}` : c.pathname, m(this.searchParams, c.searchParams), e.headers.delete(a);
    }
    let i = "x-middleware-next";
    e.headers.get(i) ? e.headers.delete(i) : !o && !e.headers.has("location") ? (this.body = e.body, this.status = e.status) : e.headers.has("location") && e.status >= 300 && e.status < 400 && (this.status = e.status), x(this.reqCtx.request.headers, e.headers), x(this.headers.normal, e.headers), this.headers.middlewareLocation = e.headers.get("location");
  }
  async runRouteMiddleware(e) {
    if (!e) return true;
    let s = e && this.output[e];
    if (!s || s.type !== "middleware") return this.status = 500, false;
    let n = await S(s, this.reqCtx, { path: this.path, searchParams: this.searchParams, headers: this.headers, status: this.status });
    return this.middlewareInvoked.push(e), n.status === 500 ? (this.status = n.status, false) : (this.processMiddlewareResp(n), true);
  }
  applyRouteOverrides(e) {
    !e.override || (this.status = void 0, this.headers.normal = new Headers(), this.headers.important = new Headers());
  }
  applyRouteHeaders(e, s, n) {
    !e.headers || (x(this.headers.normal, e.headers, { match: s, captureGroupKeys: n }), e.important && x(this.headers.important, e.headers, { match: s, captureGroupKeys: n }));
  }
  applyRouteStatus(e) {
    !e.status || (this.status = e.status);
  }
  applyRouteDest(e, s, n) {
    if (!e.dest) return this.path;
    let a = this.path, o = e.dest;
    this.wildcardMatch && /\$wildcard/.test(o) && (o = o.replace(/\$wildcard/g, this.wildcardMatch.value)), this.path = R(o, s, n);
    let i = /\/index\.rsc$/i.test(this.path), r = /^\/(?:index)?$/i.test(a), c = /^\/__index\.prefetch\.rsc$/i.test(a);
    i && !r && !c && (this.path = a);
    let f = /\.rsc$/i.test(this.path), l = /\.prefetch\.rsc$/i.test(this.path), g = this.path in this.output;
    f && !l && !g && (this.path = this.path.replace(/\.rsc/i, ""));
    let j = new URL(this.path, this.url);
    return m(this.searchParams, j.searchParams), k(this.path) || (this.path = j.pathname), a;
  }
  applyLocaleRedirects(e) {
    if (!e.locale?.redirect || !/^\^(.)*$/.test(e.src) && e.src !== this.path || this.headers.normal.has("location")) return;
    let { locale: { redirect: n, cookie: a } } = e, o = a && this.cookies[a], i = A(o ?? ""), r = A(this.reqCtx.request.headers.get("accept-language") ?? ""), l = [...i, ...r].map((g) => n[g]).filter(Boolean)[0];
    if (l) {
      !this.path.startsWith(l) && (this.headers.normal.set("location", l), this.status = 307);
      return;
    }
  }
  getLocaleFriendlyRoute(e, s) {
    return !this.locales || s !== "miss" ? e : G(e.src, this.locales) ? { ...e, src: e.src.replace(/\/\(\.\*\)\$$/, "(?:/(.*))?$") } : e;
  }
  async checkRoute(e, s) {
    let n = this.getLocaleFriendlyRoute(s, e), { routeMatch: a, routeDest: o } = this.checkRouteMatch(n, { checkStatus: e === "error", checkIntercept: e === "rewrite" }) ?? {}, i = { ...n, dest: o };
    if (!a?.match || i.middlewarePath && this.middlewareInvoked.includes(i.middlewarePath)) return "skip";
    let { match: r, captureGroupKeys: c } = a;
    if (this.applyRouteOverrides(i), this.applyLocaleRedirects(i), !await this.runRouteMiddleware(i.middlewarePath)) return "error";
    if (this.body !== void 0 || this.headers.middlewareLocation) return "done";
    this.applyRouteHeaders(i, r, c), this.applyRouteStatus(i);
    let l = this.applyRouteDest(i, r, c);
    if (i.check && !k(this.path)) if (l === this.path) {
      if (e !== "miss") return this.checkPhase(O(e));
      this.status = 404;
    } else if (e === "miss") {
      if (!(this.path in this.output) && !(this.path.replace(/\/$/, "") in this.output)) return this.checkPhase("filesystem");
      this.status === 404 && (this.status = void 0);
    } else return this.checkPhase("none");
    return !i.continue || i.status && i.status >= 300 && i.status <= 399 ? "done" : "next";
  }
  async checkPhase(e) {
    if (this.checkPhaseCounter++ >= 50) return console.error(`Routing encountered an infinite loop while checking ${this.url.pathname}`), this.status = 500, "error";
    this.middlewareInvoked = [];
    let s = true;
    for (let o of this.routes[e]) {
      let i = await this.checkRoute(e, o);
      if (i === "error") return "error";
      if (i === "done") {
        s = false;
        break;
      }
    }
    if (e === "hit" || k(this.path) || this.headers.normal.has("location") || !!this.body) return "done";
    if (e === "none") for (let o of this.locales) {
      let i = new RegExp(`/${o}(/.*)`), c = this.path.match(i)?.[1];
      if (c && c in this.output) {
        this.path = c;
        break;
      }
    }
    let n = this.path in this.output;
    if (!n && this.path.endsWith("/")) {
      let o = this.path.replace(/\/$/, "");
      n = o in this.output, n && (this.path = o);
    }
    if (e === "miss" && !n) {
      let o = !this.status || this.status < 400;
      this.status = o ? 404 : this.status;
    }
    let a = "miss";
    return n || e === "miss" || e === "error" ? a = "hit" : s && (a = O(e)), this.checkPhase(a);
  }
  async run(e = "none") {
    this.checkPhaseCounter = 0;
    let s = await this.checkPhase(e);
    return this.headers.normal.has("location") && (!this.status || this.status < 300 || this.status >= 400) && (this.status = 307), s;
  }
};
async function tt(t, e, s, n) {
  let a = new T(e.routes, s, t, n, e.wildcard), o = await et(a);
  return Et(t, o, s);
}
__name(tt, "tt");
async function et(t, e = "none", s = false) {
  return await t.run(e) === "error" || !s && t.status && t.status >= 400 ? et(t, "error", true) : { path: t.path, status: t.status, headers: t.headers, searchParams: t.searchParams, body: t.body };
}
__name(et, "et");
async function Et(t, { path: e = "/404", status: s, headers: n, searchParams: a, body: o }, i) {
  let r = n.normal.get("location");
  if (r) {
    if (r !== n.middlewareLocation) {
      let l = [...a.keys()].length ? `?${a.toString()}` : "";
      n.normal.set("location", `${r ?? "/"}${l}`);
    }
    return new Response(null, { status: s, headers: n.normal });
  }
  let c;
  if (o !== void 0) c = new Response(o, { status: s });
  else if (k(e)) {
    let l = new URL(e);
    m(l.searchParams, a), c = await fetch(l, t.request);
  } else c = await S(i[e], t, { path: e, status: s, headers: n, searchParams: a });
  let f = n.normal;
  return x(f, c.headers), x(f, n.important), c = new Response(c.body, { ...c, status: s || c.status, headers: f }), c;
}
__name(Et, "Et");
p();
u();
d();
function nt() {
  globalThis.__nextOnPagesRoutesIsolation ??= { _map: /* @__PURE__ */ new Map(), getProxyFor: Tt };
}
__name(nt, "nt");
function Tt(t) {
  let e = globalThis.__nextOnPagesRoutesIsolation._map.get(t);
  if (e) return e;
  let s = Mt();
  return globalThis.__nextOnPagesRoutesIsolation._map.set(t, s), s;
}
__name(Tt, "Tt");
function Mt() {
  let t = /* @__PURE__ */ new Map();
  return new Proxy(globalThis, { get: /* @__PURE__ */ __name((e, s) => t.has(s) ? t.get(s) : Reflect.get(globalThis, s), "get"), set: /* @__PURE__ */ __name((e, s, n) => It.has(s) ? Reflect.set(globalThis, s, n) : (t.set(s, n), true), "set") });
}
__name(Mt, "Mt");
var It = /* @__PURE__ */ new Set(["_nextOriginalFetch", "fetch", "__incrementalCache"]);
var Nt = Object.defineProperty;
var Lt = /* @__PURE__ */ __name((...t) => {
  let e = t[0], s = t[1], n = "__import_unsupported";
  if (!(s === n && typeof e == "object" && e !== null && n in e)) return Nt(...t);
}, "Lt");
globalThis.Object.defineProperty = Lt;
globalThis.AbortController = class extends AbortController {
  constructor() {
    try {
      super();
    } catch (e) {
      if (e instanceof Error && e.message.includes("Disallowed operation called within global scope")) return { signal: { aborted: false, reason: null, onabort: /* @__PURE__ */ __name(() => {
      }, "onabort"), throwIfAborted: /* @__PURE__ */ __name(() => {
      }, "throwIfAborted") }, abort() {
      } };
      throw e;
    }
  }
};
var Pn = { async fetch(t, e, s) {
  nt(), X();
  let n = await __ALSes_PROMISE__;
  if (!n) {
    let i = new URL(t.url), r = await e.ASSETS.fetch(`${i.protocol}//${i.host}/cdn-cgi/errors/no-nodejs_compat.html`), c = r.ok ? r.body : "Error: Could not access built-in Node.js modules. Please make sure that your Cloudflare Pages project has the 'nodejs_compat' compatibility flag set.";
    return new Response(c, { status: 503 });
  }
  let { envAsyncLocalStorage: a, requestContextAsyncLocalStorage: o } = n;
  return a.run({ ...e, NODE_ENV: "production", SUSPENSE_CACHE_URL: w }, async () => o.run({ env: e, ctx: s, cf: t.cf }, async () => {
    if (new URL(t.url).pathname.startsWith("/_next/image")) return K(t, { buildOutput: h, assetsFetcher: e.ASSETS, imagesConfig: _.images });
    let r = B(t);
    return tt({ request: r, ctx: s, assetsFetcher: e.ASSETS }, _, h, y);
  }));
} };
export {
  Pn as default
};
/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
//# sourceMappingURL=bundledWorker-0.7360808550927145.mjs.map
