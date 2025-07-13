export const getFullDOM = (): Promise<{ main: string; iframes: string[] }> =>
    new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return resolve({ main: "", iframes: [] });
        const tabId = tabs[0].id!;
        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          if (!frames) return resolve({ main: "", iframes: [] });

          Promise.all(
            frames.map(
              (frame) =>
                new Promise<{ id: number; html: string }>((res) => {
                  chrome.scripting.executeScript(
                    {
                      target: { tabId, frameIds: [frame.frameId] },
                      func: () => document.documentElement.outerHTML,
                    },
                    (results) =>
                      res({ id: frame.frameId, html: results?.[0]?.result ?? "" })
                  );
                })
            )
          ).then((payload) => {
            const main = payload.find((p) => p.id === 0)?.html ?? "";
            const iframes = payload.filter((p) => p.id !== 0).map((p) => p.html);
            resolve({ main, iframes });
          });
        });
      });
    });