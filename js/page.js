document.getElementById("start-button").addEventListener("click", () => {
    // 發送消息給背景腳本，要求開啟側邊欄
    chrome.runtime.sendMessage({ type: "open_side_panel" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to open side panel:",
          chrome.runtime.lastError
        );
      } else {
        console.log("Side panel opened successfully:", response);
      }
    });
  });