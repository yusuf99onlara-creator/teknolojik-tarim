const express=require("express"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const app=express(),PORT=process.env.PORT||3000;
const API_KEY="tarim2024gizli",LOGIN_PASS="00990099";
const tokens=new Set();
const DIR=path.join(__dirname,"data");
const SF=path.join(DIR,"sensor.json"),CF=path.join(DIR,"commands.json"),RF=path.join(DIR,"reports.json");
if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});
if(!fs.existsSync(SF))fs.writeFileSync(SF,"{}");
if(!fs.existsSync(CF))fs.writeFileSync(CF,"[]");
if(!fs.existsSync(RF))fs.writeFileSync(RF,"[]");

app.use(express.static("public"));
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use((req,res,next)=>{res.header("Access-Control-Allow-Origin","*");if(req.method==="OPTIONS")return res.sendStatus(200);next();});

function gp(r,n){if(r.query[n]!==undefined)return r.query[n];if(r.body&&r.body[n]!==undefined)return r.body[n];return null;}
function readJ(f,fb){try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return fb}}

let lastReportHour=-1;
function saveReport(data){
  const now=new Date();
  const h=now.getUTCHours();
  if(h===lastReportHour)return;
  lastReportHour=h;
  let reps=readJ(RF,[]);
  reps.push({
    ts:Date.now(),date:now.toISOString().slice(0,16),
    t:parseFloat(data.temp)||0,h:parseFloat(data.hum)||0,
    p:parseFloat(data.ppm)||0,g:parseInt(data.gas)||0,
    ms:parseInt(data.motor_state)||0,ls:parseInt(data.light_state)||0,
    aq:data.air_quality||"Iyi"
  });
  const cutoff=Date.now()-(7*24*60*60*1000);
  reps=reps.filter(r=>r.ts>cutoff);
  if(reps.length>168)reps=reps.slice(-168);
  fs.writeFileSync(RF,JSON.stringify(reps));
}

function handleAPI(req,res){
  const action=gp(req,"action")||"",key=gp(req,"key")||"";

  if(action==="login"){
    const pw=gp(req,"pw")||"";
    if(pw===LOGIN_PASS){const tok=crypto.randomBytes(16).toString("hex");tokens.add(tok);if(tokens.size>50)tokens.delete(tokens.values().next().value);return res.json({ok:true,token:tok});}
    return res.json({error:"Yanlis sifre"});
  }

  if(["getData","sendCmd","getReport"].includes(action)){
    const tok=gp(req,"token")||"";
    if(!tokens.has(tok))return res.json({error:"Yetkisiz",needLogin:true});
  }

  if(action==="update"){
    if(key!==API_KEY)return res.json({error:"Yetkisiz"});
    let data=readJ(SF,{});
    const map={t:"temp",h:"hum",g:"gas",p:"ppm",ms:"motor_state",ls:"light_state",ma:"motor_auto",la:"light_auto",mr:"motor_remaining",lr:"light_remaining",wm:"work_min",sm:"stop_min",loh:"light_on_h",lom:"light_on_m",lfh:"light_off_h",lfm:"light_off_m",gt:"gas_threshold",gth:"gas_threshold",aq:"air_quality",ga:"gas_alarm",ns:"ntp_synced",ct:"clock_time",up:"uptime",cl:"calibrated",mmr:"manual_motor_rem",lmr:"manual_light_rem",temp:"temp",hum:"hum",gas:"gas",ppm:"ppm",motor_state:"motor_state",light_state:"light_state",motor_auto:"motor_auto",light_auto:"light_auto",motor_remaining:"motor_remaining",light_remaining:"light_remaining",work_min:"work_min",stop_min:"stop_min",light_on_h:"light_on_h",light_on_m:"light_on_m",light_off_h:"light_off_h",light_off_m:"light_off_m",gas_threshold:"gas_threshold",air_quality:"air_quality",gas_alarm:"gas_alarm",ntp_synced:"ntp_synced",clock_time:"clock_time",uptime:"uptime",calibrated:"calibrated",manual_motor_rem:"manual_motor_rem",manual_light_rem:"manual_light_rem"};
    for(const[s,l]of Object.entries(map)){const v=gp(req,s);if(v!==null)data[l]=v;}
    if(data.air_quality)data.air_quality=data.air_quality.replace(/_/g," ");
    data.last_update=Date.now();
    fs.writeFileSync(SF,JSON.stringify(data));
    try{saveReport(data)}catch(e){}
    let cmds=readJ(CF,[]);
    if(cmds.length>0)fs.writeFileSync(CF,"[]");
    return res.json({ok:true,cmds});
  }

  if(action==="getData"){
    let data=readJ(SF,{});
    const lu=data.last_update||0;
    const age=lu>0?Math.floor((Date.now()-lu)/1000):99999;
    data.online=age<120?1:0;data.ago=age;
    const def={temp:"0",hum:"0",gas:"0",ppm:"0",motor_state:"0",light_state:"0",motor_auto:"1",light_auto:"1",motor_remaining:"0",light_remaining:"0",work_min:"3",stop_min:"15",light_on_h:"6",light_on_m:"0",light_off_h:"22",light_off_m:"0",gas_threshold:"400",air_quality:"Iyi",gas_alarm:"0",ntp_synced:"0",clock_time:"--:--:--",uptime:"0",calibrated:"0",manual_motor_rem:"0",manual_light_rem:"0"};
    for(const[k,v]of Object.entries(def)){if(!data[k]&&data[k]!==0)data[k]=v;}
    return res.json(data);
  }

  if(action==="sendCmd"){
    const cmd=gp(req,"cmd")||"",params=gp(req,"params")||"";
    if(!cmd)return res.json({error:"Komut bos"});
    let cmds=readJ(CF,[]);cmds.push({cmd,params});
    fs.writeFileSync(CF,JSON.stringify(cmds));
    return res.json({ok:true});
  }

  if(action==="getReport"){
    const reps=readJ(RF,[]);
    const days={};
    reps.forEach(r=>{
      const day=new Date(r.ts).toISOString().slice(0,10);
      if(!days[day])days[day]={temps:[],hums:[],ppms:[],aqs:[],motorOn:0,lightOn:0,count:0};
      days[day].temps.push(r.t);days[day].hums.push(r.h);days[day].ppms.push(r.p);days[day].aqs.push(r.aq);
      if(r.ms)days[day].motorOn++;if(r.ls)days[day].lightOn++;days[day].count++;
    });
    const wm=3,sm=15; // varsayilan motor zamanlama
    const summary=Object.entries(days).map(([date,d])=>{
      const motorCyclesPerHour=Math.round(60/(wm+sm));
      const expectedMotorCycles=d.count*motorCyclesPerHour;
      const lightHoursExpected=16; // varsayilan
      // Hava kalitesi dagilimi
      const aqCount={};d.aqs.forEach(a=>{aqCount[a]=(aqCount[a]||0)+1;});
      const bestAq=Object.entries(aqCount).sort((a,b)=>b[1]-a[1])[0];
      return{
        date,
        avgTemp:(d.temps.reduce((a,b)=>a+b,0)/d.temps.length).toFixed(1),
        minTemp:Math.min(...d.temps).toFixed(1),
        maxTemp:Math.max(...d.temps).toFixed(1),
        avgHum:(d.hums.reduce((a,b)=>a+b,0)/d.hums.length).toFixed(1),
        avgPPM:Math.round(d.ppms.reduce((a,b)=>a+b,0)/d.ppms.length),
        maxPPM:Math.round(Math.max(...d.ppms)),
        motorOnPct:Math.round((d.motorOn/d.count)*100),
        lightOnPct:Math.round((d.lightOn/d.count)*100),
        motorOnHours:d.motorOn,
        lightOnHours:d.lightOn,
        readings:d.count,
        dominantAq:bestAq?bestAq[0]:"Iyi",
        aqBreakdown:aqCount,
        expectedMotor:expectedMotorCycles,
        totalHours:d.count
      };
    }).sort((a,b)=>b.date.localeCompare(a.date));
    return res.json({ok:true,days:summary,total:reps.length});
  }

  return res.json({status:"Teknolojik Tarim API",ver:"3.0"});
}

app.all("/api",handleAPI);
app.all("/api.php",handleAPI);
app.listen(PORT,()=>console.log("Server port "+PORT));
