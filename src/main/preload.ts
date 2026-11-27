import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, RaphaelBridge } from '../shared/types';

const subscribe = <T,>(channel: string, cb: (value: T) => void) => {
  const listener = (_: unknown, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const bridge: RaphaelBridge = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => subscribe<AppState>('state', cb),
  onOpenSettings: (cb) => subscribe<void>('ui:open-settings', () => cb()),
  saveKey: (key) => ipcRenderer.invoke('key:save', key),
  pasteKey: () => ipcRenderer.invoke('key:paste'),
  clearKey: () => ipcRenderer.invoke('key:clear'),
  recheckKey: () => ipcRenderer.invoke('key:recheck'),
  setHotkey: (acc) => ipcRenderer.invoke('hotkey:set', acc),
  setOptions: (o) => ipcRenderer.invoke('options:set', o),
  openRiotPortal: () => ipcRenderer.invoke('portal:open'),
  toggleOverlayMove: () => ipcRenderer.invoke('overlay:move'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openLog: () => ipcRenderer.invoke('log:open'),
};

contextBridge.exposeInMainWorld('raphael', bridge);
