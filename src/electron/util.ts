import { ipcMain, WebContents, WebFrameMain } from "electron";
import { pathToFileURL } from "url";
import { getUIPath } from "./pathResolver.js";

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export function ipcHandle<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: (
    ...args: EventPayloadMapping[Key]["args"]
  ) => EventPayloadMapping[Key]["return"] | Promise<EventPayloadMapping[Key]["return"]>
) {
  ipcMain.handle(key, (event, ...args: EventPayloadMapping[Key]["args"]) => {
    if (event.senderFrame) {
      validateEventFrame(event.senderFrame);
    } else {
      throw new Error("senderFrame is null");
    }
    return handler(...args);
  });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key]["return"]
) {
  webContents.send(key, payload);
}

export function validateEventFrame(frame: WebFrameMain) {
  if (isDev() && new URL(frame.url).host === "localhost:5123") {
    return;
  }

  if (frame.url !== pathToFileURL(getUIPath()).toString()) {
    throw new Error("Malicious event");
  }
}
