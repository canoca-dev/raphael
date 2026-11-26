import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, RaphaelBridge } from '../shared/types';

const bridge: RaphaelBridge = {
  getState: () => ipcRenderer.invoke('state:get'),
  reloadEnv: () => ipcRenderer.invoke('env:reload'),
  onState: (cb) => {
    const listener = (_: unknown, s: AppState) => cb(s);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
};

contextBridge.exposeInMainWorld('raphael', bridge);
