import axios from "axios";

export const getAxiosInstance = async () => {
    const { serverURL } = await chrome.storage.local.get("serverURL");
    return axios.create({
        baseURL: serverURL || "http://localhost:8000",
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
