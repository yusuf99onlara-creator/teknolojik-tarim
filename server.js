const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "tarim2024gizli";
const LOGIN_PASS = "00990099";
const tokens = new Set();

const DATA_DIR = path.join(__dirname, "data");
const SF = path.join(DATA_DIR, "sensor.json");
const CF = path.join(DATA_DIR, "commands.json");
const RF = path.join(DATA_DIR, "reports.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SF)) fs.writeFileSync(SF, "{}");
if (!fs.existsSync(CF)) fs.writeFileSync(CF, "[]");
if (!fs.existsSync(RF)) fs.writeFileSync(RF, "[]");

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

// Saatlik rapor kaydet
let lastReportHour = -1;
function saveReport(data) {
  const now = new Date();
  const currentHour = now.getUTCHours();
  if (currentHour === lastReportHour) return;
  lastReportHour = currentHour;

  let reports = readJ(RF, []);
  reports.push({
    ts: Date.now(),
    date: now.toISOString().slice(0, 16),
    t: parseFloat(data.temp) || 0,
    h: parseFloat(data.hum) || 0,
    p: parseFloat(data.ppm) || 0,
    g: parseInt(data.gas) || 0,
    ms: parseInt(data.motor_state) || 0,
    ls: parseInt(data.light_state) || 0,
    aq: data.air_quality || "Iyi"
  });

  // 7 gun = 168 saat, fazlasini sil
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  reports = reports.filter(r => r.ts > sevenDaysAgo);
  if (reports.length > 168) reports = reports.slice(-168);

  fs.writeFileSync(RF, JSON.stringify(reports));
}

function handleAPI(req, res) {
  const action = gp(req, "action") || "";
  const key = gp(req, "key") || "";

  if (action === "login") {
    const pw = gp(req, "pw") || "";
    if (pw === LOGIN_PASS) {
      const token = crypto.randomBytes(16).toString("hex");
      tokens.add(token);
      if (tokens.size > 50) tokens.delete(tokens.values().next().value);
      return res.json({ ok: true, token });
    }
    return res.json({ error: "Yanlis sifre" });
  }

  if (["getData", "sendCmd", "getReport"].includes(action)) {
    const token = gp(req, "token") || "";
    if (!tokens.has(token)) return res.json({ error: "Yetkisiz", needLogin: true });
  }

  if (action === "update") {
    if (key !== API_KEY) return res.json({ error: "Yetkisiz" });
    let data = readJ(SF, {});
    const map = {
      t:"temp",h:"hum",g:"gas",p:"ppm",ms:"motor_state",ls:"light_state",
      ma:"motor_auto",la:"light_auto",mr:"motor_remaining",lr:"light_remaining",
      wm:"work_min",sm:"stop_min",loh:"light_on_h",lom:"light_on_m",
      lfh:"light_off_h",lfm:"light_off_m",gt:"gas_threshold",gth:"gas_threshold",
      aq:"air_quality",ga:"gas_alarm",ns:"ntp_synced",ct:"clock_time",
      up:"uptime",cl:"calibrated",mmr:"manual_motor_rem",lmr:"manual_light_rem",
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
    if (data.air_quality) data.air_quality = data.air_quality.replace(/_/g, " ");
    data.last_update = Date.now();
    fs.writeFileSync(SF, JSON.stringify(data));

    // Saatlik rapor kaydet
    try { saveReport(data); } catch(e) {}

    let cmds = readJ(CF, []);
    if (cmds.length > 0) fs.writeFileSync(CF, "[]");
    return res.json({ ok: true, cmds });
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

  if (action === "getReport") {
    const reports = readJ(RF, []);
    // Gunluk ozet olustur
    const days = {};
    reports.forEach(r => {
      const day = new Date(r.ts).toISOString().slice(0, 10);
      if (!days[day]) days[day] = { temps: [], hums: [], ppms: [], motorOn: 0, lightOn: 0, count: 0, entries: [] };
      days[day].temps.push(r.t);
      days[day].hums.push(r.h);
      days[day].ppms.push(r.p);
      if (r.ms) days[day].motorOn++;
      if (r.ls) days[day].lightOn++;
      days[day].count++;
      days[day].entries.push(r);
    });

    const summary = Object.entries(days).map(([date, d]) => ({
      date,
      avgTemp: (d.temps.reduce((a, b) => a + b, 0) / d.temps.length).toFixed(1),
      minTemp: Math.min(...d.temps).toFixed(1),
      maxTemp: Math.max(...d.temps).toFixed(1),
      avgHum: (d.hums.reduce((a, b) => a + b, 0) / d.hums.length).toFixed(1),
      avgPPM: Math.round(d.ppms.reduce((a, b) => a + b, 0) / d.ppms.length),
      motorOnPct: Math.round((d.motorOn / d.count) * 100),
      lightOnPct: Math.round((d.lightOn / d.count) * 100),
      readings: d.count,
      entries: d.entries
    })).sort((a, b) => b.date.localeCompare(a.date));

    return res.json({ ok: true, days: summary, total: reports.length });
  }

  return res.json({ status: "Teknolojik Tarim API", ver: "3.0" });
}

app.all("/api", handleAPI);
app.all("/api.php", handleAPI);
app.listen(PORT, () => console.log("Server port " + PORT));
