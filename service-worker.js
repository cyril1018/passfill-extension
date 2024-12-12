chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: "page.html" });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((message, sender) => {
  // The callback for runtime.onMessage must return falsy if we're not sending a response
  (async () => {
    if (message.type === "open_side_panel") {
      // This will open a tab-specific side panel only on the current tab.
      await chrome.sidePanel.open({ tabId: sender.tab.id });
      await chrome.sidePanel.setOptions({
        tabId: sender.tab.id,
        path: "sidepanel.html",
        enabled: true,
      });
    }
  })();
});

let masterKey = null; // 存放內存中的密鑰

chrome.runtime.onStartup.addListener(async () => {
  console.log("Extension started. Initializing master key...");
  await ensureMasterKeyInitialized();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extension installed. Initializing master key...");
  await ensureMasterKeyInitialized();
});

// 確保主密鑰初始化為同步安全
const ensureMasterKeyInitialized = async () => {
  if (masterKey) return; // 如果主密鑰已初始化，直接返回
  const result = await chrome.storage.local.get("masterKey");
  if (result.masterKey) {
    console.log("Existing master key found");
    masterKey = result.masterKey;
  } else {
    const newKey = generateRandomKey();
    console.log("Generated new master key:", newKey);
    await chrome.storage.local.set({ masterKey: newKey });
    masterKey = newKey;
  }
};

// 隨機生成 256-bit 的密鑰（32 字節）
function generateRandomKey() {
  const array = new Uint8Array(32); // 32 字節對應 256 位
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 獲取密鑰（用於加密/解密）
const getMasterKey = async () => {
  if (!masterKey) {
    await ensureMasterKeyInitialized(); // 確保密鑰已載入
  }
  if (!masterKey) {
    throw new Error("Master key not initialized");
  }
  return masterKey;
};

// 將任意長度的密鑰轉換為 16 或 32 字節
const formatKey = (key) => {
  const encoder = new TextEncoder();
  const encodedKey = encoder.encode(key);
  if (encodedKey.length === 16 || encodedKey.length === 32) {
    return encodedKey;
  }
  const paddedKey = new Uint8Array(32); // 默認使用 32 字節密鑰
  paddedKey.set(encodedKey.slice(0, 32)); // 如果超過32字節，截取
  return paddedKey;
};

let cryptoKey;
// 將主密鑰導入為 CryptoKey
const importMasterKey = async () => {
  if (cryptoKey) return cryptoKey; // 如果密鑰已導入則重用
  const encodedKey = formatKey(await getMasterKey());
  cryptoKey = await crypto.subtle.importKey(
    "raw",
    encodedKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return cryptoKey;
};

// 加密數據
const encryptData = async (data) => {
  const key = await importMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 隨機初始化向量
  const encodedData = new TextEncoder().encode(data);
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );
  return {
    encryptedData: Array.from(new Uint8Array(encryptedData)),
    iv: Array.from(iv),
  };
};

// 解密數據
const decryptData = async ({ encryptedData, iv }) => {
  const key = await importMasterKey();
  const decryptedData = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(encryptedData)
  );
  return new TextDecoder().decode(decryptedData);
};

// 消息處理邏輯
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === "encrypt") {
        const result = await encryptData(message.data);
        sendResponse({ status: "success", data: result });
      } else if (message.action === "decrypt") {
        const result = await decryptData(message.data);
        sendResponse({ status: "success", data: result });
      }
    } catch (error) {
      sendResponse({ status: "error", message: error.message });
    }
  })();
  return true; // 表示非同步回應
});
