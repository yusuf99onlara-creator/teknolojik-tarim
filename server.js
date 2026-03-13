const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "tarim2024gizli";

const DATA_DIR = path.join(__dirname, "data");
const SF = path.join(DATA_DIR, "sensor.json");
const CF = path.join(DATA_DIR, "commands.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SF)) fs.writeFileSync(SF, "{}");
if (!fs.existsSync(CF)) fs.writeFileSync(CF, "[]");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function gp(req, n) {
  if (req.query[n] !== undefined) return req.query[n];
  if (req.body && req.body[n] !== undefined) return req.body[n];
  return null;
}
function readJ(f, fb) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { return fb; }
}

function handleAPI(req, res) {
  const action = gp(req, "action") || "";
  const key = gp(req, "key") || "";

  if (action === "update") {
    if (key !== API_KEY) return res.json({ error: "Yetkisiz" });
    let data = readJ(SF, {});
    const map = {
      t:"temp",h:"hum",g:"gas",p:"ppm",ms:"motor_state",ls:"light_state",
      ma:"motor_auto",la:"light_auto",mr:"motor_remaining",lr:"light_remaining",
      wm:"work_min",sm:"stop_min",loh:"light_on_h",lom:"light_on_m",
      lfh:"light_off_h",lfm:"light_off_m",gt:"gas_threshold",aq:"air_quality",
      ga:"gas_alarm",ns:"ntp_synced",ct:"clock_time",up:"uptime",
      cl:"calibrated",mmr:"manual_motor_rem",lmr:"manual_light_rem",
      temp:"temp",hum:"hum",gas:"gas",ppm:"ppm",
      motor_state:"motor_state",light_state:"light_state",
      motor_auto:"motor_auto",light_auto:"light_auto",
      motor_remaining:"motor_remaining",light_remaining:"light_remaining",
      work_min:"work_min",stop_min:"stop_min",
      light_on_h:"light_on_h",light_on_m:"light_on_m",
      light_off_h:"light_off_h",light_off_m:"light_off_m",
      gas_threshold:"gas_threshold",air_quality:"air_quality",
      gas_alarm:"gas_alarm",ntp_synced:"ntp_synced",
      clock_time:"clock_time",uptime:"uptime",
      calibrated:"calibrated",manual_motor_rem:"manual_motor_rem",
      manual_light_rem:"manual_light_rem"
    };
    for (const [s, l] of Object.entries(map)) {
      const v = gp(req, s);
      if (v !== null) data[l] = v;
    }
    data.last_update = Date.now();
    fs.writeFileSync(SF, JSON.stringify(data));
    let cmds = readJ(CF, []);
    if (cmds.length > 0) fs.writeFileSync(CF, "[]");
    return res.json({ ok: true, cmds: cmds });
  }

  if (action === "getData") {
    let data = readJ(SF, {});
    const lu = data.last_update || 0;
    const age = lu > 0 ? Math.floor((Date.now() - lu) / 1000) : 99999;
    data.online = age < 120 ? 1 : 0;
    data.ago = age;
    const def = {
      temp:"0",hum:"0",gas:"0",ppm:"0",motor_state:"0",light_state:"0",
      motor_auto:"1",light_auto:"1",motor_remaining:"0",light_remaining:"0",
      work_min:"3",stop_min:"15",light_on_h:"6",light_on_m:"0",
      light_off_h:"22",light_off_m:"0",gas_threshold:"400",air_quality:"Iyi",
      gas_alarm:"0",ntp_synced:"0",clock_time:"--:--:--",uptime:"0",
      calibrated:"0",manual_motor_rem:"0",manual_light_rem:"0"
    };
    for (const [k, v] of Object.entries(def)) {
      if (!data[k] && data[k] !== 0) data[k] = v;
    }
    return res.json(data);
  }

  if (action === "sendCmd") {
    const cmd = gp(req, "cmd") || "";
    const params = gp(req, "params") || "";
    if (!cmd) return res.json({ error: "Komut bos" });
    let cmds = readJ(CF, []);
    cmds.push({ cmd, params });
    fs.writeFileSync(CF, JSON.stringify(cmds));
    return res.json({ ok: true });
  }

  return res.json({ status: "Teknolojik Tarim API", ver: "2.0" });
}

app.all("/api", handleAPI);
app.all("/api.php", handleAPI);
app.listen(PORT, () => console.log("Server port " + PORT));
