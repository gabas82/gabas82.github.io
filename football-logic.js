// Извлечена чиста логика (прогнози, статистика, история) от football.html, за да може
// да се тества самостоятелно (Node/Vitest) и същевременно да се ползва непроменена в
// браузъра чрез <script src="football-logic.js"> (класически script, споделя глобален scope).

function getToday(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});}
// api-sports.io кодира "сезон" по годината, в която ЗАПОЧВА (напр. "2025" = сезон
// 2025-2026, авг 2025 - май 2026) - за разлика от календарната година. Юли е
// прагът (не 1 януари), за да покрие ранните квалификации на ШЛ/ЛЕ/ЛК, които
// стартират преди самите първенства. Без тази граница заявките към api-sports
// сочат грешен/несъществуващ сезон от януари до юли всяка година.
function currentSeasonYear(now){
  const d=now||new Date();
  const y=d.getFullYear(), m=d.getMonth()+1;
  return m>=7?y:y-1;
}
// PR A (виж discussion-а "надеждна сезонна история за Ефбет/Сюпер Лиг/БЛ2") -
// консервативна долна граница за season/from/to параметри на api-sports.io
// /fixtures заявки, предназначени да ЗАМЕНЯТ league-wide last=N в бъдещ PR,
// без да го правят още - тук са само чисти, самостоятелно тестваеми helper-и,
// невключени в реалните fetch-ове. Сезонът идва от вече съществуващата
// currentSeasonYear() - не дублира прага юни/юли, само го преизползва.
function getAsSeasonStartDate(season){return season+'-07-01';}
function toYmd(date){return date.toISOString().split('T')[0];}
function buildAsSeasonHistoryParams(leagueId,now){
  const d=now||new Date();
  const season=currentSeasonYear(d);
  return{league:leagueId,season,from:getAsSeasonStartDate(season),to:toYmd(d)};
}
function buildAsSeasonHistoryQuery(leagueId,now){
  const p=buildAsSeasonHistoryParams(leagueId,now);
  return'league='+p.league+'&season='+p.season+'&from='+p.from+'&to='+p.to;
}
function getDateMinus(d){const dt=new Date();dt.setDate(dt.getDate()-d);return dt.toISOString().split('T')[0];}
function getDatePlus(d){const dt=new Date();dt.setDate(dt.getDate()+d);return dt.toISOString().split('T')[0];}
function calcPct(h,a){const hn=parseInt(h)||0,an=parseInt(a)||0,t=hn+an||1;return Math.round(hn/t*100);}
function poissonProb(lambda,k){let r=Math.exp(-lambda);for(let i=1;i<=k;i++)r*=lambda/i;return r;}
// BIDIRECTIONAL MARKETS (виж discussion-а "всеки сценарий да има равноправна
// математическа оценка") - "Под" НИКОГА не се смята с отделна pUnder()/pTeamUnder()
// формула (риск да не сумира до 100% заради собствен независим клампинг) - винаги чист
// комплемент 100-вече_клампнатото_Над, огледално на вече съществуващия образец
// за under25/noBtts в buildPrediction() по-долу. Огледално важи и за полувремевите
// пазари, понеже gmHt=calcGoalMarkets(expH*htRatio,expA*htRatio) реюзва СЪЩАТА
// функция - новите Под полета идват безплатно и за тях.
function calcGoalMarkets(expH,expA){
  function pOver(n){let p=0;for(let h=0;h<=10;h++)for(let a=0;a<=10;a++)if(h+a>n)p+=poissonProb(expH,h)*poissonProb(expA,a);return Math.min(97,Math.max(3,Math.round(p*100)));}
  function pTeam(exp,n){let p=0;for(let g=0;g<=10;g++)if(g>n)p+=poissonProb(exp,g);return Math.min(97,Math.max(3,Math.round(p*100)));}
  const over05=pOver(0.5),over15=pOver(1.5),over25=pOver(2.5),over35=pOver(3.5),over45=pOver(4.5);
  const hOver05=pTeam(expH,0.5),hOver15=pTeam(expH,1.5),aOver05=pTeam(expA,0.5),aOver15=pTeam(expA,1.5);
  return{
    over05,over15,over25,over35,over45,hOver05,hOver15,aOver05,aOver15,
    under05:100-over05,under15:100-over15,under25:100-over25,under35:100-over35,under45:100-over45,
    hUnder05:100-hOver05,hUnder15:100-hOver15,aUnder05:100-aOver05,aUnder15:100-aOver15,
  };
}
// ИСТИНСКА СЪВМЕСТНА ВЕРОЯТНОСТ за Над/Под n + Г/Г (виж discussion-а "когато
// събитията произлизат от една Poisson решетка, използвай съвместната им
// вероятност") - ЕДИН премин по СЪЩАТА (h,a) решетка, която вече захранва
// pOver()/pBtts() поотделно, вместо наивно умножение на двата отделни %
// (buildBetBuilder() по-долу правеше точно това досега - подвежда при
// корелирани пазари, виж discussion-а). НОРМАЛИЗАЦИЯ: четирите изхода
// (Над+ГГ-ДА/Над+ГГ-НЕ/Под+ГГ-ДА/Под+ГГ-НЕ) ПО ДЕФИНИЦИЯ разделят ЦЕЛИЯ
// пространство от резултати - суровата (неклампната) им сума е точно 100%.
// Ако клампнем и четирите ПООТДЕЛНО (както pOver/pBtts правят за собствените
// си пазари), сборът вече НЕ е гарантиран 100% (същия риск, който избягваме
// за Над/Под по-горе). Затова - три от тях се смятат директно (с обичайния
// [3,97] "никога сигурност" кламп, СЪЩИЯ диапазон като pOver, за консистентност
// с вече показаните Над/Под числа в интерфейса), а четвъртата (underBttsNo)
// е ЧИСТ остатък до 100 - огледално на aWinAdj=100-drawP-hWinAdj в
// buildPrediction() по-долу, вместо собствен независим клампинг.
function calcOverBttsJoint(expH,expA,n){
  const threshold=n==null?2.5:n;
  let rawOverYes=0,rawOverNo=0,rawUnderYes=0,rawUnderNo=0;
  for(let h=0;h<=10;h++){
    for(let a=0;a<=10;a++){
      const p=poissonProb(expH,h)*poissonProb(expA,a);
      const isOver=(h+a)>threshold;
      const isBtts=h>0&&a>0;
      if(isOver&&isBtts)rawOverYes+=p;
      else if(isOver&&!isBtts)rawOverNo+=p;
      else if(!isOver&&isBtts)rawUnderYes+=p;
      else rawUnderNo+=p;
    }
  }
  const clamp=(x)=>Math.min(97,Math.max(3,Math.round(x*100)));
  let overBttsYes=clamp(rawOverYes);
  let overBttsNo=clamp(rawOverNo);
  let underBttsYes=clamp(rawUnderYes);
  let underBttsNo=clamp(rawUnderNo);
  // НОРМАЛИЗАЦИЯ (виж discussion-а "verify normalization and consistency with
  // interface-shown values, including existing clamp limits") - при екстремни
  // λ индивидуалният [3,97] клампинг на ВСЕКИ от четирите дяла поотделно може
  // да "открадне" фантомна вероятностна маса (дял под 3% бива изкуствено
  // повдигнат до 3%, трикратно) и сумата да надхвърли 100. Затова излишъкът
  // (или дефицитът) се абсорбира пропорционално от най-големите дялове, които
  // имат достатъчен толеранс спрямо [3,97], докато сумата стане точно 100.
  let sum=overBttsYes+overBttsNo+underBttsYes+underBttsNo;
  if(sum!==100){
    let delta=100-sum;
    const vals={overBttsYes,overBttsNo,underBttsYes,underBttsNo};
    const order=Object.keys(vals).sort((a,b)=>vals[b]-vals[a]);
    for(const key of order){
      if(delta===0)break;
      const next=Math.min(97,Math.max(3,vals[key]+delta));
      delta-=(next-vals[key]);
      vals[key]=next;
    }
    overBttsYes=vals.overBttsYes;overBttsNo=vals.overBttsNo;underBttsYes=vals.underBttsYes;underBttsNo=vals.underBttsNo;
  }
  return{overBttsYes,overBttsNo,underBttsYes,underBttsNo};
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

// "Вероятен голмайстор" за конкретен мач: първо пробва World Cup голмайсторски
// списък (по teamId, с fallback по фъзи съвпадение на името на отбора - виж
// findTeamTopScorer за същия trick), а ако няма такъв - брои голове от goals[]
// масива на последните завършени мачове на всеки от двата отбора (recentGoals
// = голове от последните 2 мача, ползва се за "тренд" индикатора в UI-я).
function calcTopScorers(match, allMatches, wcScorers){
  const hId=match.homeTeam?.id, aId=match.awayTeam?.id;
  if(!hId||!aId)return [];
  const hn2=match.homeTeam?.name||'';
  const an2=match.awayTeam?.name||'';
  const playerStats={};

  const finishedMatches=allMatches.filter(m=>m.status==='FINISHED').sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate));
  const teamFinishedMatches={
    [hId]: finishedMatches.filter(m=>m.homeTeam?.id===hId||m.awayTeam?.id===hId),
    [aId]: finishedMatches.filter(m=>m.homeTeam?.id===aId||m.awayTeam?.id===aId)
  };
  const teamMatchCount={};
  teamMatchCount[hId]=teamFinishedMatches[hId].length;
  teamMatchCount[aId]=teamFinishedMatches[aId].length;

  if(wcScorers&&wcScorers.length){
    wcScorers.forEach(s=>{
      if(!s.name)return;
      const isHomeById=s.teamId===hId;
      const isAwayById=s.teamId===aId;
      const isHomeByName=s.teamName&&(s.teamName===hn2||hn2.includes(s.teamName)||s.teamName.includes(hn2));
      const isAwayByName=s.teamName&&(s.teamName===an2||an2.includes(s.teamName)||s.teamName.includes(an2));
      const isHome=isHomeById||isHomeByName;
      const isAway=isAwayById||isAwayByName;
      if(!isHome&&!isAway)return;
      const realTeamId=isHome?hId:aId;
      const key=s.id||s.name;
      playerStats[key]={id:s.id,name:s.name,teamId:realTeamId,goals:s.goals||0,recentGoals:0,matchesPlayed:teamMatchCount[realTeamId]||1};
    });
  }

  if(!Object.keys(playerStats).length){
    [hId,aId].forEach(tid=>{
      teamFinishedMatches[tid].forEach((m,idxInTeamMatches)=>{
        (m.goals||[]).forEach(g=>{
          if(g.type==='OWN')return;
          const pid=g.scorer?.id;const gTid=g.team?.id;
          if(!pid||!gTid||gTid!==tid)return;
          const key=pid;
          if(!playerStats[key]){playerStats[key]={id:pid,name:g.scorer?.name||'—',teamId:gTid,goals:0,recentGoals:0,matchesPlayed:teamMatchCount[tid]||1};}
          playerStats[key].goals++;
          if(idxInTeamMatches<2)playerStats[key].recentGoals++;
        });
      });
    });
  }

  return Object.values(playerStats).filter(p=>p.goals>0).sort((a,b)=>b.goals-a.goals).slice(0,5);
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

// Намира записа, който съвпада с даден мач: първо по точен ID сред ЦЕЛИЯ списък
// кандидати (не спира на първия попаднал по име), а само ако няма ID съвпадение —
// по двойка имена на отборите (пробва всеки подаден вариант на името - shortName
// и пълно име). При няколко кандидата със същите имена на отборите (напр. реванш
// между едни и същи два отбора в кратък период) избира най-близкия по дата, за да
// не сдвои прогноза с грешния мач. candidates трябва да са с форма {id,home,away,date}.
function findMatchingRecord(candidates, targetId, homeNames, awayNames, targetDate){
  const byId=(candidates||[]).find(c=>targetId!=null&&String(c.id)===String(targetId));
  if(byId)return byId;
  const hSet=(homeNames||[]).filter(Boolean);
  const aSet=(awayNames||[]).filter(Boolean);
  if(!hSet.length||!aSet.length)return null;
  const pool=(candidates||[]).filter(c=>hSet.includes(c.home)&&aSet.includes(c.away));
  if(!pool.length)return null;
  if(pool.length===1||!targetDate)return pool[0];
  const target=new Date(targetDate).getTime();
  return pool.reduce((best,c)=>{
    const cd=Math.abs(new Date(c.date).getTime()-target);
    const bd=Math.abs(new Date(best.date).getTime()-target);
    return cd<bd?c:best;
  });
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

// API ОПТИМИЗАЦИЯ (виж discussion-а "backgroundHistorySync да заявява история
// само за лигите с реално нерешени прогнози") - заменя безусловния
// AS_LEAGUES.map(...) (всичките 11 api-sports лиги на всеки 5 мин) с точния
// списък лиги, за които ИМА какво да се реши.
//
// Легаси записи (преди compId полето да съществува) - ПРОВЕРЕНО изрично
// (не пропуснато): единствените други полета са `comp` (суровото, НЕпреведено
// име на лигата от api-sports, напр. "First League" - НЕ българския етикет
// "Ефбет Лига" от AS_LEAGUES[].title) и `id` ("as_"+ID на МАЧА, не на лигата).
// Нито едното не дава надежден, статично проверим обратен път към league ID -
// опит за съпоставяне по име би разчитал на непотвърдена/крехка статична
// таблица. Затова legacyFallback остава единственото безопасно поведение за
// такива записи: пълен fallback към всичките 11, никога тихо пропускане.
function getUnresolvedAsLeagueIds(hist){
  const leagueIds=new Set();
  let legacyFallback=false;
  (hist||[]).forEach(h=>{
    if(!h||h.result||!String(h.id).startsWith('as_'))return;
    const compId=h.compId;
    if(typeof compId==='string'&&compId.startsWith('as_')){
      const leagueId=Number(compId.slice(3));
      if(Number.isFinite(leagueId)){leagueIds.add(leagueId);return;}
    }
    legacyFallback=true;
  });
  return{leagueIds:[...leagueIds],legacyFallback};
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
  // NaN guard (виж discussion-а "патологичен 1X2 случай") - hWinP/aWinP ТЕОРЕТИЧНО
  // могат едновременно да се закръглят до 0 (екстремно рядко - изисква drawP да
  // доминира изцяло), което без guard-а дели 0/0 -> NaN, развалящ целия ред. При
  // тоя ръб-случай делим остатъка (100-drawP) поравно - неутрален fallback, НЕ
  // пипа нормалния случай (denom>0 винаги на практика), и пази сбора 100% точно
  // толкова стриктно, колкото и нормалния път (aWinAdj е винаги чист остатък).
  const hWinAaWinDenom=hWinP+aWinP;
  const hWinAdj=hWinAaWinDenom>0?Math.round(hWinP*(100-drawP)/hWinAaWinDenom):Math.round((100-drawP)/2);
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
  const cornersUnder=100-cornersOver; // чист комплемент, огледално на under25/noBtts
  // F3 (виж discussion-а "прозрачност на историческата извадка") - hSeason.n/
  // aSeason.n вече се пресмятат вътре в seasonRate() по-горе (точния брой
  // FINISHED мачове, използвани за hWinRate/aWinRate - СЪЩИЯТ филтър захранва
  // и avgGAll/avgCAll), но досега никога не излизаха извън тая функция. Чисто
  // адитивни полета - не пипат никоя от съществуващите формули/изчисления
  // по-горе, само предават вече изчислено число за показване на UI.
  return{hId,aId,hWin:hWinAdj,draw:drawP,aWin:aWinAdj,over25:over25P,under25:under25P,btts:bttsP,noBtts:100-bttsP,expH:expH.toFixed(1),expA:expA.toFixed(1),topScores:scores.slice(0,4),htScores:htS.slice(0,4),expCorners,cornersOver,cornersUnder,expYellow:Math.round((hFS<6&&aFS<6)?3.5:3),hForm,aForm,g10:goalBefore10(expH,expA),gm,gmHt,htRatio:Math.round(htRatio*100),hWinRatePct:Math.round(hWinRate*100),aWinRatePct:Math.round(aWinRate*100),hMatchesN:hSeason?hSeason.n:0,aMatchesN:aSeason?aSeason.n:0};
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

// ЗАДАЧА 6.2 (виж "Sample Size Indicator") - ЧИСТО ОПИСАТЕЛНА категория за
// РАЗМЕРА на историческата извадка зад прогнозата (колко FINISHED мача са
// налични за двата отбора) - НЕ е измерена статистическа надеждност/точност
// и НЕ влиза в calcConfidence()/buildPrediction() (и двете остават напълно
// непипнати - виж одита от Задача №6/6.1: calcConfidence() вече никога не
// чете hMatchesN/aMatchesN). Прагове - по-слабата от двете извадки
// (Math.min) определя категорията, огледално на вече съществуващия модел в
// sampleSizeHtml() (football.html) - "по-слабото от двата отбора ограничава
// целия сигнал". Етикетите са изрично неутрални (размер, не качество/
// сигурност/точност) - "Голяма извадка" НЕ означава "гарантирана точност".
function sampleReliabilityTier(hMatchesN, aMatchesN){
  const hN=Number.isFinite(hMatchesN)?hMatchesN:0;
  const aN=Number.isFinite(aMatchesN)?aMatchesN:0;
  const minN=Math.min(hN,aN);
  let tier,label;
  if(minN<=2){tier=1;label='Крайно малка извадка';}
  else if(minN<=4){tier=2;label='Малка извадка';}
  else if(minN<=9){tier=3;label='Умерена извадка';}
  else if(minN<=19){tier=4;label='Добра извадка';}
  else{tier=5;label='Голяма извадка';}
  return{hMatchesN:hN,aMatchesN:aN,minN,tier,label};
}

// КАЛИБРАЦИЯ (Етап A, виж discussion-а "не искам произволни проценти, които
// изглеждат убедително, но не са доказани") - групира вече записаната история
// (savePrediction() пази суровите проценти в h.pred, updateHistoryResults()
// пази реалния изход в h.result) по 10-пунктови вероятностни кофи ЗА ВСЕКИ
// пазар поотделно - за разлика от съществуващата ИСТОРИЯ статистика
// (loadHistory()), която пулира всички нива на увереност в един общ "посочен
// изход" % и така не отговаря на въпроса "при 70% прогнози, събитието
// настъпва ли ~70 пъти от 100". Чисто пресмятане върху вече съхранени данни -
// БЕЗ нови API заявки. g10 (гол до 10-а минута) е изключен - updateHistoryResults()
// не пази реален изход за тоя пазар (не може да се верифицира), затова не е в
// списъка markets по-долу - НЕ защото g10 не се пази (пази се в h.pred.g10),
// а защото резултатът му никога не се потвърждава срещу реалност.
function calibrationBucket(pct){
  const b=Math.min(90,Math.floor(pct/10)*10);
  return b+'-'+(b+9)+'%';
}
const CALIBRATION_MARKETS=[
  {key:'1x2',label:'1X2',pick:(p)=>p.hWin>=p.aWin&&p.hWin>=p.draw?{pct:p.hWin,hit:(r)=>r.winner==='1'}:p.aWin>=p.hWin&&p.aWin>=p.draw?{pct:p.aWin,hit:(r)=>r.winner==='2'}:{pct:p.draw,hit:(r)=>r.winner==='X'}},
  {key:'over25',label:'НАД/ПОД 2.5',pick:(p)=>p.over25>50?{pct:p.over25,hit:(r)=>r.total>2.5}:{pct:100-p.over25,hit:(r)=>r.total<=2.5}},
  {key:'btts',label:'Г/Г',pick:(p)=>p.btts>50?{pct:p.btts,hit:(r)=>r.gg}:{pct:100-p.btts,hit:(r)=>!r.gg}},
  {key:'dc',label:'ДВОЕН ШАНС',pick:(p)=>{const dc=calcDoubleChance(p.hWin,p.draw,p.aWin);return{pct:dc.pct,hit:(r)=>doubleChanceHit(dc.pick,r.winner)};}},
];
// resolved-only (виж loadHistory() - decidedAfterRegulation записите нямат
// winner/total/gg, не могат да се верифицират срещу 90-мин пазарите по-горе,
// огледално на съществуващия wr=hist.filter(...) филтър в loadHistory()).
function calcCalibration(history){
  const resolved=(history||[]).filter(h=>h.result&&!h.result.decidedAfterRegulation&&h.pred);
  return CALIBRATION_MARKETS.map(mkt=>{
    const buckets={};
    resolved.forEach(h=>{
      const{pct,hit}=mkt.pick(h.pred);
      if(pct==null||!Number.isFinite(pct))return;
      const bk=calibrationBucket(pct);
      if(!buckets[bk])buckets[bk]={bucket:bk,sortKey:Math.min(90,Math.floor(pct/10)*10),n:0,hits:0,pctSum:0};
      buckets[bk].n++;
      buckets[bk].pctSum+=pct;
      if(hit(h.result))buckets[bk].hits++;
    });
    const rows=Object.values(buckets)
      .sort((a,b)=>a.sortKey-b.sortKey)
      .map(b=>({bucket:b.bucket,n:b.n,avgPredictedPct:Math.round(b.pctSum/b.n),actualPct:Math.round(b.hits/b.n*100)}));
    return{market:mkt.key,label:mkt.label,rows,totalN:resolved.length};
  });
}

// ============================================================================
// PRE-MATCH ONLY + CROSS-PROVIDER DEDUPLICATION (виж discussion-а "качество
// на статистиката") - calcCalibration() по-горе остава НЕПРОМЕНЕН (приема
// каквото му се подаде) - филтрирането на "надежден" подмасив става ТУК,
// преди да стигне до него. Нищо от долното не трие/презаписва localStorage
// историята - само чете и филтрира подадения масив.
// ============================================================================

// "Pre-match" = прогнозата е записана (savedAt) СТРИКТНО ПРЕДИ реалния kickoff
// (date) - проверимо ретроактивно за ВСИЧКИ записи, стари и нови, защото
// savedAt/date се пазят от самото начало на savePrediction(). statusAtSave
// (нов, виж savePrediction() в football.html) е ДОПЪЛНИТЕЛНА, по-строга
// проверка само за занапред записани записи - ако липсва (стар запис), падаме
// единствено на timestamp сравнението (fallback, изрично поискан).
function isPreMatchPrediction(entry){
  if(!entry||entry.savedAt==null||!entry.date)return false;
  const kickoff=new Date(entry.date).getTime();
  if(!Number.isFinite(kickoff)||!Number.isFinite(entry.savedAt))return false;
  if(entry.savedAt>=kickoff)return false;
  if(entry.statusAtSave!=null&&!['SCHEDULED','TIMED'].includes(entry.statusAtSave))return false;
  return true;
}

// Сдвоява competition id (football-data.org числов ИЛИ api-sports "as_"-
// префиксиран) до общ "двойка" ключ през compsAsMap (football.html:
// COMPS_AS_MAP, подава се като параметър - football-logic.js не го държи
// собствено, за да няма дублирано поддържане на едни и същи числа). null,
// ако compId липсва или лигата не е от 7-те застъпващи се (виж discussion-а) -
// за тях cross-provider дублиране структурно не може да възникне.
function mapCompPairKey(compId,compsAsMap){
  if(compId==null||!compsAsMap)return null;
  const s=String(compId);
  if(s.startsWith('as_')){
    const asNum=Number(s.slice(3));
    if(!Number.isFinite(asNum))return null;
    const fdId=Object.keys(compsAsMap).find(k=>compsAsMap[k]===asNum);
    return fdId!=null?fdId+'|'+asNum:null;
  }
  const fdNum=Number(s);
  if(!Number.isFinite(fdNum)||!(fdNum in compsAsMap))return null;
  return fdNum+'|'+compsAsMap[fdNum];
}
// Фъзи сравнение на име на отбор - огледално на findMatchingRecord/
// findTeamTopScorer по-горе (includes-based, не точно съвпадение), понеже
// двата доставчика понякога викат отбора различно (съкратено/пълно име).
function teamNamesMatch(a,b){
  if(!a||!b)return false;
  const na=String(a).toLowerCase().trim(),nb=String(b).toLowerCase().trim();
  if(!na||!nb)return false;
  return na===nb||na.includes(nb)||nb.includes(na);
}
const CROSS_PROVIDER_KICKOFF_TOLERANCE_MS=5*60000;
// Два записа от РАЗЛИЧНИ доставчици за ЕДИН и същ реален мач - и четирите
// условия ЗАЕДНО (различен доставчик, лигите сдвоени, kickoff в тесен
// толеранс, И двата отбора фъзи-съвпадат). При НЕсигурност (липсващ compId,
// несдвоена лига, разлика извън толеранса, само едно от двете имена съвпада)
// -> false, НЕ се обединява автоматично (изрично изискване - "при несигурно
// съвпадение не обединявай").
function isCrossProviderDuplicate(a,b,compsAsMap){
  if(!a||!b||a===b)return false;
  if(a.compId==null||b.compId==null)return false;
  const aIsAs=String(a.compId).startsWith('as_'),bIsAs=String(b.compId).startsWith('as_');
  if(aIsAs===bIsAs)return false; // само различен доставчик се брои за "дубликат" тук
  const pairA=mapCompPairKey(a.compId,compsAsMap),pairB=mapCompPairKey(b.compId,compsAsMap);
  if(!pairA||!pairB||pairA!==pairB)return false;
  const ta=new Date(a.date).getTime(),tb=new Date(b.date).getTime();
  if(!Number.isFinite(ta)||!Number.isFinite(tb))return false;
  if(Math.abs(ta-tb)>CROSS_PROVIDER_KICKOFF_TOLERANCE_MS)return false;
  return teamNamesMatch(a.home,b.home)&&teamNamesMatch(a.away,b.away);
}
// Детерминистичен избор на ЕДИН запис измежду потвърдена cross-provider група
// дубликати - НАЙ-РАННАТА валидна pre-match прогноза (по savedAt), НЕ
// осредняване (изрично изискване). Ако НИТО един запис в групата не е
// pre-match (напр. и двата доставчика са видени за пръв път докато мачът вече
// тече) - цялата група отпада от калибрацията (по-безопасно от да изберем
// произволен LIVE-записан представител).
function pickCanonicalEntry(group){
  const preMatch=(group||[]).filter(isPreMatchPrediction);
  if(!preMatch.length)return null;
  return preMatch.reduce((best,e)=>e.savedAt<best.savedAt?e:best);
}
// Оркестрира целия "надежден подмасив" pipeline - НЕ трие/презаписва
// оригиналната история (само чете подадения масив, връща нов филтриран).
// Връща и прозрачните бройки за УИ секцията КАЛИБРАЦИЯ (виж discussion-а
// "TRANSPARENCY" - общо/резолвнати/pre-match/изключени закъснели/изключени
// дублирани).
function filterReliableHistory(history,compsAsMap){
  const all=history||[];
  const resolved=all.filter(h=>h.result&&!h.result.decidedAfterRegulation&&h.pred);
  const preMatchOnly=resolved.filter(isPreMatchPrediction);
  const excludedLate=resolved.length-preMatchOnly.length;
  const used=new Set();
  const kept=[];
  let excludedDuplicate=0;
  for(let i=0;i<preMatchOnly.length;i++){
    const e=preMatchOnly[i];
    if(used.has(e.id))continue;
    const group=[e];
    for(let j=i+1;j<preMatchOnly.length;j++){
      const o=preMatchOnly[j];
      if(used.has(o.id))continue;
      if(isCrossProviderDuplicate(e,o,compsAsMap)){group.push(o);used.add(o.id);}
    }
    used.add(e.id);
    if(group.length===1){kept.push(e);continue;}
    const canon=pickCanonicalEntry(group);
    excludedDuplicate+=group.length-(canon?1:0);
    if(canon)kept.push(canon);
  }
  return{
    reliable:kept,
    totalHistory:all.length,
    totalResolved:resolved.length,
    preMatchCount:preMatchOnly.length,
    excludedLate,
    excludedDuplicate,
  };
}
// Високо ниво на абстракция за УИ (football.html calibrationHtml()) -
// филтрира, после подава надеждния подмасив на НЕПРОМЕНЕНИЯ calcCalibration()
// по-горе (zero breaking change за съществуващите му извиквания/тестове).
function buildCalibrationReport(history,compsAsMap){
  const f=filterReliableHistory(history,compsAsMap);
  return{
    markets:calcCalibration(f.reliable),
    totalHistory:f.totalHistory,
    totalResolved:f.totalResolved,
    preMatchCount:f.preMatchCount,
    excludedLate:f.excludedLate,
    excludedDuplicate:f.excludedDuplicate,
    reliableCount:f.reliable.length,
  };
}

// F1 ДИАГНОСТИКА (виж discussion-а "Празен API отговор да не се приема
// автоматично за незапочнал сезон") - loadASLeagueTab() в football.html строи
// allRaw от ТРИ Promise.allSettled резултата (next/last/live fixtures). Досега
// празен allRaw се третираше еднакво, независимо дали е ЗАРЕЖДАНЕ грешка
// (fetch rejected - мрежа/API недостъпност) или ДЕЙСТВИТЕЛНО празен сезон
// (fulfilled с празни масиви). Чиста функция - testable без DOM/fetch/мрежа,
// не променя кои заявки се пращат, само как се ИНТЕРПРЕТИРА резултатът им.
// EMPTY_SEASON се връща САМО когато входът е валиден масив и ВСИЧКИ елементи
// са валидни, успешно "fulfilled" резултати - отсъствие/невалидна форма на
// входа (null/undefined/[]/развален запис) НЕ е доказателство за празен
// сезон, затова се връща отделно UNKNOWN_ERROR, а не EMPTY_SEASON.
function classifyAsLeagueTabEmptyState(settledResults){
  if(!Array.isArray(settledResults)||settledResults.length===0)return 'UNKNOWN_ERROR';
  let anyRejected=false;
  for(const r of settledResults){
    if(!r||typeof r!=='object'||(r.status!=='fulfilled'&&r.status!=='rejected'))return 'UNKNOWN_ERROR';
    if(r.status==='rejected')anyRejected=true;
  }
  return anyRejected?'FETCH_ERROR':'EMPTY_SEASON';
}

// F2a ХРОНОЛОГИЧНО СОРТИРАНЕ (виж discussion-а "прогнозите не трябва да
// зависят от реда на отваряне на табовете") - calcForm() по-горе (.slice(-5)),
// както и form5Html()/htTrendHtml() във football.html (.slice(-5)/.slice(-10)),
// ВСИЧКИ приемат allMatches за вече хронологично подреден (възходящо по
// utcDate), за да вземат правилно "последните N" мача. loadUpcoming() във
// football.html строи allMatches от НЯКОЛКО различни fetch-а (football-data.org
// + Световно + api-sports extra лиги), слети последователно - без гаранция за
// общ хронологичен ред между тях. Чиста, non-mutating функция - връща НОВ
// сортиран масив, не променя входния; не пипа buildPrediction/calcForm/
// calcCalibration самите - само нормализира входа ПРЕДИ да стигне до тях.
function sortMatchesByDate(matches){
  return (matches||[]).slice().sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate));
}

// F3a (виж discussion-а "лигите не трябва да изчезват без обяснение, но и не
// да се разгъват стотици мачове") - сортира (чрез sortMatchesByDate, ТАВАНЪТ
// СЕ ПРИЛАГА СЛЕД сортирането, за да останат действително най-близките) и
// отрязва до maxCount. Чиста, non-mutating функция.
function limitSortedUpcoming(matches, maxCount){
  return sortMatchesByDate(matches).slice(0, maxCount);
}

// F3a - проверява дали дадено състезание е имало ЗАВЪРШЕН мач в последните
// lookbackDays дни (вече извлечени данни - allMatches, без нова заявка).
// Ползва се САМО за да добавим опционалния суфикс "Възможна пауза" към
// honest-ия базов текст при празен прозорец - НИКОГА не се ползва като
// доказателство за обратното (виж discussion-а "не използвай липсата на
// исторически данни като доказателство за неактивен сезон") - ако входният
// масив е празен (напр. защото историческата заявка се е провалила), тази
// функция просто връща false (без суфикс), не твърди нищо категорично.
function hasRecentFinishedActivity(matches, now, lookbackDays){
  const nowMs=(now instanceof Date?now:new Date()).getTime();
  const cutoffMs=nowMs-(lookbackDays||0)*24*60*60*1000;
  return (matches||[]).some(m=>m&&m.status==='FINISHED'&&m.utcDate&&new Date(m.utcDate).getTime()>=cutoffMs);
}

// F3a - честeн текст при празен прозорец (виж discussion-а "не твърди, че
// няма публикувана програма извън проверения период") - базовият текст
// описва САМО какво реално е проверено (следващите windowDays дни); суфиксът
// "Възможна пауза" се добавя единствено при налична скорошна активност,
// никога не се твърди категорично причината.
function buildEmptyWindowMessage(windowDays, hasRecentActivity){
  const base=`Няма мачове в следващите ${windowDays} дни.`;
  return hasRecentActivity?base+' Възможна пауза.':base;
}

// В браузъра (класически <script>) горните декларации стават глобални и се ползват
// directly от football.html. В Node (Vitest) ги правим достъпни през module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getToday, getDateMinus, getDatePlus, currentSeasonYear, getAsSeasonStartDate,
    buildAsSeasonHistoryParams, buildAsSeasonHistoryQuery, calcPct, poissonProb, calcGoalMarkets,
    goalBefore10, computeRegularScore, durationBadge, HIST_KEY, getHistory,
    saveHistory, migrateHistory, getUnresolvedAsLeagueIds, calcForm, formDotsHtml, buildPrediction, calcConfidence,
    sampleReliabilityTier,
    formatMatchDateTime, normalizeFootballDataScorers, normalizeApiSportsScorers, topTwoScorers,
    calcDoubleChance, doubleChanceHit, doubleChanceLabel, findTeamTopScorer, findMatchingRecord,
    calcTopScorers, calibrationBucket, calcCalibration, CALIBRATION_MARKETS,
    isPreMatchPrediction, mapCompPairKey, teamNamesMatch, isCrossProviderDuplicate,
    pickCanonicalEntry, filterReliableHistory, buildCalibrationReport, calcOverBttsJoint,
    classifyAsLeagueTabEmptyState, sortMatchesByDate,
    limitSortedUpcoming, hasRecentFinishedActivity, buildEmptyWindowMessage
  };
}
