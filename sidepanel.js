function isValidURL(url) {
  try {
    new URL(url); // 如果 URL 無效，這裡會拋出錯誤
    return true;
  } catch {
    return false;
  }
}

document.getElementById("save").addEventListener("click", () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const remark = document.getElementById("remark").value;

  if (username && password) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error("無法獲取當前頁面的 URL。");
        return;
      }

      const url = tabs[0].url;
      if (!isValidURL(url)) {
        console.error("Invalid URL:", url);
        return;
      }
      const origin = new URL(url).origin; // 獲取當前頁面的 URL
      console.log("儲存帳號的 Origin:", origin);

      chrome.runtime.sendMessage(
        { action: "encrypt", data: password },
        (response) => {
          if (response.status === "success") {
            const encryptedPassword = response.data;
            chrome.storage.local.get({ accounts: [] }, (data) => {
              const accounts = Array.isArray(data.accounts)
                ? data.accounts
                : [];
              console.log("儲存前的帳號清單:", accounts);
              accounts.unshift({
                origin,
                username,
                password: encryptedPassword,
                remark,
              });
              chrome.storage.local.set({ accounts }, () => {
                console.log("帳號已成功儲存。");
                loadAccounts();
                document.getElementById("username").value = "";
                document.getElementById("password").value = "";
                document.getElementById("remark").value = "";
              });
            });
          } else {
            alert("Failed to encrypt password: " + response.message);
          }
        }
      );
    });
  }
});

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    console.log("Storage cleared");
    loadAccounts();
  });
});
document
  .getElementById("refresh")
  .addEventListener("click", () => location.reload());

function loadAccounts() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error("無法獲取當前頁面的 URL。");
      return;
    }

    const url = tabs[0].url;
    if (!isValidURL(url)) {
      console.error("Invalid URL:", url);
      return;
    }
    const origin = new URL(url).origin; // 獲取當前頁面的 URL
    console.log("加載帳號的 Origin:", origin);

    chrome.storage.local.get({ accounts: [] }, (data) => {
      console.log("目前儲存的帳號清單:", data.accounts);
      const list = document.getElementById("account-list");
      list.innerHTML = "";
      if (!data.accounts.find((x) => x.origin === origin)) {
        const noDataItem = document.createElement("li");
        noDataItem.className = "no-data"; // 可選的樣式類
        noDataItem.textContent = chrome.i18n.getMessage("noData"); // 顯示提示文字
        list.appendChild(noDataItem);
        return;
      }
      data.accounts.forEach((account, index) => {
        if (account.origin === origin) {
          const item = document.createElement("li");

          // 帳號顯示
          const accountText = document.createElement("span");
          accountText.textContent = account.remark
            ? account.remark + " (" + account.username + ")"
            : account.username;

          accountText.classList.add("account-text");

          accountText.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              chrome.runtime.sendMessage(
                { action: "decrypt", data: account.password },
                (response) => {
                  if (response.status === "success") {
                    chrome.tabs.query(
                      { active: true, currentWindow: true },
                      (tabs) => {
                        chrome.scripting.executeScript(
                          {
                            target: { tabId: tabs[0].id },
                            func: fillForm,
                            args: [account.username, response.data],
                          },
                          (results) => {
                            if (chrome.runtime.lastError) {
                              console.error(
                                "填寫腳本執行錯誤:",
                                chrome.runtime.lastError.message
                              );
                            } else {
                              const result = results[0].result;
                              console.log("填寫結果:", result);
                              updateStatus(result);
                              // 點擊後將該帳號移到最前
                              chrome.storage.local.get(
                                { accounts: [] },
                                (data) => {
                                  const accounts = data.accounts;
                                  const updatedAccounts = accounts.filter(
                                    (_, i) => i !== index
                                  ); // 刪除舊位置
                                  updatedAccounts.unshift(account); // 插入到最前
                                  chrome.storage.local.set(
                                    { accounts: updatedAccounts },
                                    loadAccounts
                                  );
                                }
                              );
                            }
                          }
                        );
                      }
                    );
                  } else {
                    alert("Failed to decrypt password: " + response.message);
                  }
                }
              );
            });
          });

          // 刪除按鈕
          const deleteButton = document.createElement("button");
          deleteButton.className = "delete-btn";
          // 創建圖標元素
          const icon = document.createElement("i");
          icon.className = "fas fa-trash-alt"; // 設置 Font Awesome 圖標類名

          // 將圖標添加到按鈕
          deleteButton.appendChild(icon);
          deleteButton.addEventListener("click", () => {
            const updatedAccounts = data.accounts.filter((_, i) => i !== index);
            chrome.storage.local.set(
              { accounts: updatedAccounts },
              loadAccounts
            );
          });

          item.appendChild(accountText);
          item.appendChild(deleteButton);
          list.appendChild(item);
        }
      });

      bindI18nClickToFill();
    });
  });
}
function fillForm(username, password) {
  const inputFields = Array.from(document.querySelectorAll("input"));
  let usernameField = null;
  let passwordField = null;

  // 優先找到名稱中包含 'user' 或 'account' 的帳號欄位
  usernameField = inputFields.find(
    (field) =>
      field.getAttribute("type") === "text" &&
      (field.name.toLowerCase().includes("user") ||
        field.name.toLowerCase().includes("account"))
  );

  // 如果沒找到，退而求其次找第一個 text 或 email 欄位
  if (!usernameField) {
    usernameField = inputFields.find(
      (field) =>
        field.getAttribute("type") === "text" ||
        field.getAttribute("type") === "email"
    );
  }

  // 找密碼欄位
  passwordField = inputFields.find(
    (field) => field.getAttribute("type") === "password"
  );

  // 填入資料
  if (usernameField) {
    usernameField.value = username;
  }
  if (passwordField) {
    passwordField.value = password;
  }

  // 返回執行結果
  return {
    usernameFilled: !!usernameField,
    passwordFilled: !!passwordField,
  };
}

function updateStatus({ usernameFilled, passwordFilled }) {
  if (usernameFilled && passwordFilled) {
    showMessage("填入成功 Success!");
  } else if (!usernameFilled) {
    showMessage("找不到帳號欄位 Username field not found!");
  } else if (!passwordFilled) {
    showMessage("找不到密碼欄位 Passwor field not found！");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup loaded!");
  loadAccounts();
});

function showMessage(msg) {
  const message = document.getElementById("message-container");
  message.textContent = msg;
  message.classList.add("show"); // 顯示提示
  setTimeout(() => {
    message.classList.remove("show"); // 3 秒後隱藏
  }, 3000); // 3000 毫秒（3 秒）
}

document.addEventListener("DOMContentLoaded", () => {
  BindI18n();
  BindTabEvents();
});

function BindTabEvents() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // 移除所有按鈕的 active 樣式
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      // 添加當前按鈕的 active 樣式
      button.classList.add("active");

      // 隱藏所有的 tab-pane
      const targetTab = button.getAttribute("data-tab");
      tabPanes.forEach((pane) => {
        if (pane.id === targetTab) {
          pane.classList.add("active");
        } else {
          pane.classList.remove("active");
        }
      });
    });
  });
}

function BindI18n() {
  const replace = (selector, messageName) => {
    // 獲取所有匹配的元素
    const elements = document.querySelectorAll(selector);
    const message = chrome.i18n.getMessage(messageName);
    // 遍歷每個元素，設置其 textContent
    elements.forEach((element) => {
      element.textContent = message;
    });
  };

  const replaceTextNode = (selector, messageName, position = "first") => {
    // 獲取元素
    const element = document.querySelector(selector);

    if (element) {
      // 使用 Chrome i18n API 獲取翻譯
      const message = chrome.i18n.getMessage(messageName);

      // 獲取子節點，根據 position 決定是第一個還是最後一個文本節點
      const childNodes = Array.from(element.childNodes);
      const targetTextNode =
        position === "first"
          ? childNodes.find((node) => node.nodeType === Node.TEXT_NODE)
          : childNodes
              .reverse()
              .find((node) => node.nodeType === Node.TEXT_NODE);

      // 替換文本內容
      if (targetTextNode) {
        targetTextNode.textContent = message;
      }
    }
  };

  // 替換第一個文本節點
  const replaceFirstText = (selector, messageName) =>
    replaceTextNode(selector, messageName, "first");

  // 替換最後一個文本節點
  const replaceLastText = (selector, messageName) =>
    replaceTextNode(selector, messageName, "last");

  // 替換標題
  replace("#add-account-title", "addAccountTitle");
  replace("#account-list-title", "accountListTitle");

  // 替換警告訊息
  replace("#warning-title", "warningTitle");
  replaceLastText("#warning-message", "warningMessage");
  replace("#add-account-warning", "addAccountWarning");

  // 替換按鈕
  replaceLastText("#save", "saveButton");
  replaceLastText("#refresh", "refreshButton");

  // input
  const placeholders = [
    { selector: "#username", messageName: "usernamePlaceholder" },
    { selector: "#password", messageName: "passwordPlaceholder" },
    { selector: "#remark", messageName: "remarkPlaceholder" },
  ];

  placeholders.forEach(({ selector, messageName }) => {
    const element = document.querySelector(selector);
    if (element) {
      element.placeholder = chrome.i18n.getMessage(messageName);
    }
  });
}

function bindI18nClickToFill() {
  const replaceAttribute = (selector, attribute, messageName) => {
    // 獲取所有匹配的元素
    const elements = document.querySelectorAll(selector);
    const message = chrome.i18n.getMessage(messageName);
    console.log("clickToFill i18n:", elements, message);
    elements.forEach((element) => {
      element.setAttribute(attribute, message);
    });
  };
  replaceAttribute(
    "#account-list li .account-text",
    "data-hint",
    "clickToFill"
  );
}
