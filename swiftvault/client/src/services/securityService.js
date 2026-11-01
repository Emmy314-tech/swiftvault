import { startAuthentication } from "@simplewebauthn/browser";
import api from "../api";

const requestContext = (body, params = {}) => ({ body: body || {}, params });

const createPasskeyGrant = async (action, request) => {
  const { data: challenge } = await api.post("/security/step-up/passkey/options", { action, request });
  const response = await startAuthentication({ optionsJSON: challenge.options });
  const { data } = await api.post("/security/step-up/passkey/verify", { response });
  return data.token;
};

const createPasswordGrant = async (action, request) => {
  const password = await requestPasswordConfirmation();
  const { data } = await api.post("/security/step-up/password", { password, action, request });
  return data.token;
};

const requestPasswordConfirmation = () => new Promise((resolve, reject) => {
  const supportsDialog = typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
  const dialog = document.createElement(supportsDialog ? "dialog" : "div");
  dialog.className = supportsDialog
    ? "w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-black/50 dark:bg-gray-900"
    : "fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4";
  if (!supportsDialog) {
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
  }
  dialog.setAttribute("aria-labelledby", "step-up-title");
  const form = document.createElement("form");
  form.className = "w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900";
  const title = document.createElement("h2");
  title.id = "step-up-title";
  title.className = "text-lg font-semibold text-gray-900";
  title.textContent = "Confirm this sensitive action";
  const description = document.createElement("p");
  description.className = "text-sm text-gray-600";
  description.textContent = "Enter your SwiftVault password to authorize this action. Your password is not stored.";
  const label = document.createElement("label");
  label.className = "block text-sm font-medium text-gray-700";
  label.textContent = "Account password";
  const input = document.createElement("input");
  input.type = "password";
  input.name = "password";
  input.autocomplete = "current-password";
  input.required = true;
  input.className = "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900";
  label.append(input);
  const buttons = document.createElement("div");
  buttons.className = "flex justify-end gap-3";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100";
  cancel.textContent = "Cancel";
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.className = "rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700";
  confirm.textContent = "Authorize";
  buttons.append(cancel, confirm);
  form.append(title, description, label, buttons);
  dialog.append(form);

  let settled = false;
  const finish = (password) => {
    if (settled) return;
    settled = true;
    if (supportsDialog && dialog.open) dialog.close();
    dialog.remove();
    if (password) resolve(password);
    else reject(new Error("Action authorization was cancelled."));
  };
  cancel.addEventListener("click", () => finish(null));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    finish(input.value);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish(null);
  });
  if (!supportsDialog) {
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(null);
    });
  }
  document.body.append(dialog);
  if (supportsDialog) dialog.showModal();
  input.focus();
});

export const authorizeSensitiveAction = async (action, body, params = {}) => {
  const request = requestContext(body, params);
  if (typeof window !== "undefined" && window.PublicKeyCredential && typeof navigator.credentials?.get === "function") {
    try {
      return await createPasskeyGrant(action, request);
    } catch (error) {
      const passkeyUnavailable = error.response?.status === 409 || error.response?.status === 503;
      const browserCancelled = ["NotAllowedError", "NotSupportedError", "AbortError"].includes(error.name);
      if (!passkeyUnavailable && !browserCancelled) throw error;
    }
  }
  return createPasswordGrant(action, request);
};

export const getSecurityDevices = () => api.get("/security/devices");
export const beginPasskeyLogin = () => api.post("/security/passkey/login/options");
export const verifyPasskeyLogin = (response) => api.post("/security/passkey/login/verify", { response });
export const beginPasskeyRegistration = (payload) => api.post("/security/passkey/registration/options", payload);
export const verifyPasskeyRegistration = (response) => api.post("/security/passkey/registration/verify", { response });
export const revokePasskey = (id) => api.delete(`/security/passkeys/${id}`);
export const revokeSession = (tokenId) => api.delete(`/security/sessions/${encodeURIComponent(tokenId)}`);
