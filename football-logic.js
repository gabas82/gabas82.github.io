// Извлечена чиста логика (прогнози, статистика, история) от football.html, за да може
// да се тества самостоятелно (Node/Vitest) и същевременно да се ползва непроменена в
// браузъра чрез <script src="football-logic.js"> (класически script, споделя глобален scope).

function getToday(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});}
function getDateMinus(d){const dt=new Date();dt.setDate(dt.getDate()-d);return dt.toISOString().split('T')[0];}
function getDatePlus(d){const dt=new Date();dt.setDate(dt.getDate()+d);return dt.toISOString().split('T')[0];}
function calcPct(h,a){const hn=parseInt(h)||0,an=parseInt(a)||0,t=hn+an||1;return Math.round(hn/t*100);}
function poissonProb(lambda,k){let r=Math.exp(-lambda);for(let i=1;i<=k;i++)r*=lambda/i;return r;}
function calcGoalMarkets(expH,expA){
  function pOver(n){let p=0;for(let h=0;h<=10;h++)for(let a=0;a<=10;a++)if(h+a>n)p+=poissonProb(expH,h)*poissonProb(expA,a);return Math.min(97,Math.max(3,Math.round(p*100)));}
  function pTeam(exp,n){let p=0;for(let g=0;g<=10;g++)if(g>n)p+=poissonProb(exp,g);return Math.min(97,Math.max(3,Math.round(p*100)));}
  return{over05:pOver(0.5),over15:pOver(1.5),over25:pOver(2.5),over35:pOver(3.5),over45:pOver(4.5),hOver05:pTeam(expH,0.5),hOver15:pTeam(expH,1.5),aOver05:pTeam(expA,0.5),aOver15:pTeam(expA,1.5)};
}
function goalBefore10(expH,expA){return Math.min(45,Math.max(8,Math.round((1-Math.exp(-(expH+expA)*(10/90)))*100)));}

// Двоен шанс: изключва най-малко вероятния единичен изход (1/X/2) и комбинира
// другите два — стандартната логика на пазара "двоен шанс" в залаганията.
function calcDoubleChance(hWin,draw,aWin){
  const min=Math.min(hWin,draw,aWin);
  if(min===aWin)return{pick:'1X',pct:hWin+draw};
  if(min===hWin)return{pick:'X2',pct:draw+aWin};
  return{pick:'12',pct:hWin+aWin};
}
function doubleChanceHit(pick,winner){
  if(pick==='1X')return winner==='1'||winner==='X';
  if(pick==='X2')return winner==='X'||winner==='2';
  return winner==='1'||winner==='2';
}
function doubleChanceLabel(pick){
  return pick==='1X'?'1X (Дом./Равен)':pick==='X2'?'X2 (Равен/Гост)':'12 (Дом./Гост)';
}

// Дата + час на мача в локалната часова зона на зрителя (за ориентация в списъците
// с мачове, независимо дали е на живо, приключил или предстоящ).
function formatMatchDateTime(utcDate){
  if(!utcDate)return '';
  const d=new Date(utcDate);
  if(isNaN(d.getTime()))return '';
  return d.toLocaleDateString('bg-BG',{day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'});
}

// Нормализира отговора на football-data.org /competitions/{id}/scorers в единен формат.
function normalizeFootballDataScorers(json){
  const list=(json?.scorers||[]).map(s=>({
    name:s.player?.name||'—',
    team:s.team?.shortName||s.team?.name||'—',
    teamId:s.team?.id??null,
    goals:s.goals||0
  })).filter(s=>s.goals>0);
  list.sort((a,b)=>b.goals-a.goals);
  return list;
}

// Нормализира отговора на api-sports.io /players/topscorers в същия формат.
function normalizeApiSportsScorers(json){
  const list=(json?.response||[]).map(p=>{
    const stat=p.statistics?.[0]||{};
    return{
      name:p.player?.name||'—',
      team:stat.team?.name||'—',
      teamId:stat.team?.id??null,
      goals:stat.goals?.total||0
    };
  }).filter(s=>s.goals>0);
  list.sort((a,b)=>b.goals-a.goals);
  return list;
}

function topTwoScorers(list){
  return list.slice(0,2);
}

// Намира голмайстора на конкретен отбор в нормализиран (вече сортиран по голове
// низходящо) списък голмайстори на първенството — така картичката на мача може
// да показва голмайстора на всеки от двата играещи отбора, а не първенството
// като цяло. Съвпадението е по teamId (надежден идентификатор от същия източник
// като мача), с fallback по име, когато teamId липсва в данните.
function findTeamTopScorer(list,teamId,teamName){
  const norm=(teamName||'').toLowerCase();
  const found=(list||[]).find(s=>{
    if(teamId!=null&&s.teamId!=null)return s.teamId===teamId;
    if(!norm||!s.team)return false;
    const st=s.team.toLowerCase();
    return st===norm||norm.includes(st)||st.includes(norm);
  });
  return found||null;
}

// v3.25: computeRegularScore() връща 90-минутния резултат само когато мачът
// не е решен с продължения/дузпи (score.duration). Ако е решен след 90-та
// минута, връща null — тогава кодът показва бележка вместо да сравнява
// прогнозата (1X2/Над-Под/Г-Г) с резултат, който вече не е 90-минутен.
function computeRegularScore(m){
  const dur=m.score?.duration;
  if(!dur||dur==='REGULAR')return{home:m.score?.fullTime?.home,away:m.score?.fullTime?.away};
  return null;
}
function durationBadge(m){
  const dur=m.score?.duration;
  if(!dur||dur==='REGULAR')return'';
  return dur==='PENALTY_SHOOTOUT'?' · ДЗ':' · ПРОДЪЛЖ.';
}

const HIST_KEY='football_pred_history_v2';
function getHistory(){try{return JSON.parse(localStorage.getItem(HIST_KEY)||'[]');}catch(e){return[];}}
function saveHistory(arr){try{localStorage.setItem(HIST_KEY,JSON.stringify(arr));}catch(e){}}
function migrateHistory(){
  try{
    const old=localStorage.getItem('football_pred_history');
    if(old&&!localStorage.getItem(HIST_KEY)){localStorage.setItem(HIST_KEY,old);}
  }catch(e){}
}

function calcForm(matches,teamId){
  const fin=matches.filter(m=>m.status==='FINISHED'&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId)).slice(-5);
  return fin.map(m=>{const isH=m.homeTeam?.id===teamId;const hg=m.score?.fullTime?.home??0,ag=m.score?.fullTime?.away??0;if(isH)return hg>ag?'W':hg===ag?'D':'L';return ag>hg?'W':ag===hg?'D':'L';});
}
function formDotsHtml(form){if(!form.length)return '<div style="font-size:9px;color:var(--muted)">няма данни</div>';return `<div class="form-dots">${form.map(f=>`<div class="fd ${f}"></div>`).join('')}</div>`;}

function buildPrediction(match,allMatches){
  const hId=match.homeTeam?.id,aId=match.awayTeam?.id;
  if(!hId||!aId)return null;
  const hForm=calcForm(allMatches,hId),aForm=calcForm(allMatches,aId);
  function fScore(f){return f.reduce((s,x)=>s+(x==='W'?3:x==='D'?1:0),0);}

  function avgGAll(matches,teamId){
    const rel=matches.filter(m=>m.status==='FINISHED'&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId));
    if(!rel.length)return null;
    return rel.reduce((s,m)=>{const isH=m.homeTeam?.id===teamId;return s+(isH?(m.score?.fullTime?.home??0):(m.score?.fullTime?.away??0));},0)/rel.length;
  }
  function avgCAll(matches,teamId){
    const rel=matches.filter(m=>m.status==='FINISHED'&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId));
    if(!rel.length)return null;
    return rel.reduce((s,m)=>{const isH=m.homeTeam?.id===teamId;return s+(isH?(m.score?.fullTime?.away??0):(m.score?.fullTime?.home??0));},0)/rel.length;
  }

  function htAvgAll(matches,teamId){
    const rel=matches.filter(m=>m.status==='FINISHED'&&m.score?.halfTime!=null&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId));
    if(!rel.length)return null;
    const htG=rel.reduce((s,m)=>{const isH=m.homeTeam?.id===teamId;return s+(isH?(m.score?.halfTime?.home??0):(m.score?.halfTime?.away??0));},0)/rel.length;
    const ftG=rel.reduce((s,m)=>{const isH=m.homeTeam?.id===teamId;return s+(isH?(m.score?.fullTime?.home??0):(m.score?.fullTime?.away??0));},0)/rel.length;
    return ftG>0?htG/ftG:0.45;
  }

  const hAvgG=avgGAll(allMatches,hId),hAvgC=avgCAll(allMatches,hId);
  const aAvgG=avgGAll(allMatches,aId),aAvgC=avgCAll(allMatches,aId);
  if(hAvgG===null&&hAvgC===null&&aAvgG===null&&aAvgC===null)return null;

  // Успеваемост за целия наличен сезон (W/D/L%) — по-стабилен сигнал от
  // последните 5 мача, особено в началото на сезона или при неравномерна форма.
  function seasonRate(matches,teamId){
    const rel=matches.filter(m=>m.status==='FINISHED'&&(m.homeTeam?.id===teamId||m.awayTeam?.id===teamId));
    if(!rel.length)return null;
    let w=0,d=0,l=0;
    rel.forEach(m=>{
      const isH=m.homeTeam?.id===teamId;
      const mg=isH?(m.score?.fullTime?.home??0):(m.score?.fullTime?.away??0);
      const og=isH?(m.score?.fullTime?.away??0):(m.score?.fullTime?.home??0);
      if(mg>og)w++;else if(mg===og)d++;else l++;
    });
    return{winRate:w/rel.length,drawRate:d/rel.length,lossRate:l/rel.length,n:rel.length};
  }
  const hSeason=seasonRate(allMatches,hId),aSeason=seasonRate(allMatches,aId);
  const hWinRate=hSeason?hSeason.winRate:0.33,aWinRate=aSeason?aSeason.winRate:0.33;

  const expH=Math.max(0.3,((hAvgG??1.2)+(aAvgC??1.2))/2*1.1);
  const expA=Math.max(0.3,((aAvgG??1.2)+(hAvgC??1.2))/2*0.9);
  const expTotal=expH+expA;

  const hHtRatio=htAvgAll(allMatches,hId)??0.45;
  const aHtRatio=htAvgAll(allMatches,aId)??0.45;
  const htRatio=(hHtRatio+aHtRatio)/2;

  const hFS=fScore(hForm),aFS=fScore(aForm),tot=hFS+aFS+1;
  const hWinP=Math.round(((hFS/tot)*0.35+(expH/expTotal)*0.35+hWinRate*0.30)*100);
  const aWinP=Math.round(((aFS/tot)*0.35+(expA/expTotal)*0.35+aWinRate*0.30)*100);
  const drawP=Math.max(5,100-hWinP-aWinP);
  const hWinAdj=Math.round(hWinP*(100-drawP)/(hWinP+aWinP));
  const aWinAdj=100-drawP-hWinAdj;
  const gm=calcGoalMarkets(expH,expA);
  const gmHt=calcGoalMarkets(expH*htRatio,expA*htRatio);
  const over25P=gm.over25,under25P=100-over25P;
  function pBtts(){let p=0;for(let h=1;h<=10;h++)for(let a=1;a<=10;a++)p+=poissonProb(expH,h)*poissonProb(expA,a);return Math.min(85,Math.max(15,Math.round(p*100)));}
  const bttsP=pBtts();
  let scores=[];for(let h=0;h<=4;h++)for(let a=0;a<=4;a++)scores.push({h,a,p:poissonProb(expH,h)*poissonProb(expA,a)*100});scores.sort((a,b)=>b.p-a.p);
  let htS=[];for(let h=0;h<=2;h++)for(let a=0;a<=2;a++)htS.push({h,a,p:poissonProb(expH*htRatio,h)*poissonProb(expA*htRatio,a)*100});htS.sort((a,b)=>b.p-a.p);
  const expCorners=Math.round(expTotal*1.8+5.5);
  const cornersOver=Math.min(80,Math.max(20,expCorners>=10?Math.round(50+(expCorners-10)*8):Math.round(50-(10-expCorners)*8)));
  return{hId,aId,hWin:hWinAdj,draw:drawP,aWin:aWinAdj,over25:over25P,under25:under25P,btts:bttsP,noBtts:100-bttsP,expH:expH.toFixed(1),expA:expA.toFixed(1),topScores:scores.slice(0,4),htScores:htS.slice(0,4),expCorners,cornersOver,expYellow:Math.round((hFS<6&&aFS<6)?3.5:3),hForm,aForm,g10:goalBefore10(expH,expA),gm,gmHt,htRatio:Math.round(htRatio*100),hWinRatePct:Math.round(hWinRate*100),aWinRatePct:Math.round(aWinRate*100)};
}

function calcConfidence(pred, odds){
  if(!pred)return null;
  let score=0, factors=[];
  const maxWin=Math.max(pred.hWin,pred.draw,pred.aWin);
  if(maxWin>=65){score+=25;factors.push('Силен фаворит');}
  else if(maxWin>=55){score+=15;factors.push('Умерен фаворит');}
  else{score+=5;}
  const overUnderConf=Math.abs(pred.over25-50);
  if(overUnderConf>=25){score+=20;factors.push('Ясен над/под сигнал');}
  else if(overUnderConf>=15){score+=12;}
  else{score+=4;}
  const bttsConf=Math.abs(pred.btts-50);
  if(bttsConf>=20){score+=15;factors.push('Ясен Г/Г сигнал');}
  else if(bttsConf>=10){score+=8;}
  else{score+=2;}
  if(odds&&odds.homeWin&&odds.draw&&odds.awayWin){
    const hImpl=Math.round(100/odds.homeWin);
    const aImpl=Math.round(100/odds.awayWin);
    const dImpl=Math.round(100/odds.draw);
    if(pred.hWin>hImpl+8||pred.aWin>aImpl+8||pred.draw>dImpl+8){score+=20;factors.push('VALUE засечен');}
    else if(pred.hWin>hImpl+4||pred.aWin>aImpl+4){score+=10;}
  } else {score+=5;}
  const hFormScore=pred.hForm?pred.hForm.reduce((s,f)=>s+(f==='W'?3:f==='D'?1:0),0):0;
  const aFormScore=pred.aForm?pred.aForm.reduce((s,f)=>s+(f==='W'?3:f==='D'?1:0),0):0;
  const formDiff=Math.abs(hFormScore-aFormScore);
  if(formDiff>=6){score+=20;factors.push('Голяма разлика във форма');}
  else if(formDiff>=3){score+=12;}
  else{score+=4;}
  score=Math.min(98,Math.max(10,score));
  return{score,factors};
}

// В браузъра (класически <script>) горните декларации стават глобални и се ползват
// directly от football.html. В Node (Vitest) ги правим достъпни през module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getToday, getDateMinus, getDatePlus, calcPct, poissonProb, calcGoalMarkets,
    goalBefore10, computeRegularScore, durationBadge, HIST_KEY, getHistory,
    saveHistory, migrateHistory, calcForm, formDotsHtml, buildPrediction, calcConfidence,
    formatMatchDateTime, normalizeFootballDataScorers, normalizeApiSportsScorers, topTwoScorers,
    calcDoubleChance, doubleChanceHit, doubleChanceLabel, findTeamTopScorer
  };
}
