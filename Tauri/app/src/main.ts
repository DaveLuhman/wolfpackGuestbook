import "./style.css";
import { invoke } from "@tauri-apps/api/core";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <h1>Guestbook</h1>
  <div>
    <label>Onecard: <input id="onecard" type="number" /></label>
  </div>
  <div>
    <label>Name: <input id="name" type="text" /></label>
  </div>
  <button id="submit">Submit Entry</button>
  <button id="anon">Anonymous</button>
  <button id="refresh">Load Entries</button>
  <button id="flush">Flush</button>
  <pre id="entries"></pre>
`;

document.getElementById("submit")!.addEventListener("click", async () => {
  const onecard = parseInt((document.getElementById("onecard") as HTMLInputElement).value);
  const name = (document.getElementById("name") as HTMLInputElement).value;
  await invoke("create_entry", { onecard, name });
});

document.getElementById("anon")!.addEventListener("click", async () => {
  await invoke("create_anonymous");
});

async function load() {
  const data = (await invoke("get_entries")) as any[];
  document.getElementById("entries")!.textContent = JSON.stringify(data, null, 2);
}
document.getElementById("refresh")!.addEventListener("click", load);

document.getElementById("flush")!.addEventListener("click", async () => {
  await invoke("flush_entries");
  load();
});

load();
