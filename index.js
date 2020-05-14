/* eslent-env node */
/* global xelib, registerPatcher, patcherUrl, info */

const {
  AddElement,
  AddElementValue,
  EditorID,
  GetElement,
  GetElements,
  GetIntValue,
  GetIsFemale,
  GetLinksTo,
  GetValue,
  GetWinningOverride,
  HasElement,
  LongName,
  SetIntValue,
  SetLinksTo,
  SetValue,
  Signature
} = xelib

const crypto = require('crypto')

function Random (edid, seed) {
  const edidbuf = Buffer.alloc(255 + 4)

  const edidLength = edid.length

  edidbuf.writeUInt32BE(seed, 0)
  edidbuf.write(edid, 4, edidLength)

  const tempbuf = edidbuf.slice(0, edidLength + 4)

  const outbuf = crypto.createHash('md5').update(tempbuf).digest()

  let state = outbuf.readUInt32BE(0)

  return function (modulus) {
    // from https://en.wikipedia.org/wiki/Xorshift
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0 // state is once more uint32.
    if (modulus) return state % modulus
    return state
  }
}

function csvToArray (text) {
  let previousCharacter = ''
  let field = ''
  let row = [field]
  const table = []
  let columnNumber = 0
  let rowNumber = 0
  let outsideQuote = true
  let character
  for (character of text) {
    if (character === '"') {
      if (outsideQuote && character === previousCharacter) {
        field += character
      }
      outsideQuote = !outsideQuote
    } else if (outsideQuote && character === ',') {
      row[columnNumber] = field
      field = ''
      columnNumber += 1
      character = ''
    } else if (outsideQuote && character === '\n') {
      if (previousCharacter === '\r') {
        field = field.slice(0, -1)
      }
      row[columnNumber] = field
      table[rowNumber] = row
      row = []
      field = ''
      rowNumber += 1
      columnNumber = 0
      character = ''
    } else {
      field += character
    }
    previousCharacter = character
  }
  if (field !== '') {
    row[columnNumber] = field
  }
  if (row.length) {
    table[rowNumber] = row
  }
  return table
}

function applyHeadings (data, extraHeadings) {
  const headings = data.shift()
  const result = []
  const template = {}
  for (const heading of headings) {
    Object.defineProperty(template, heading, {
      configurable: true,
      enumerable: true,
      writable: true
    })
  }
  if (extraHeadings) {
    for (const heading of extraHeadings) {
      Object.defineProperty(template, heading, {
        configurable: true,
        enumerable: true,
        writable: true
      })
    }
  }
  Object.seal(template)
  for (const row of data) {
    const obj = Object.create(template)
    for (let i = 0; i < row.length; i++) {
      obj[headings[i]] = row[i]
    }
    result.push(obj)
  }
  return result
}

function mapOn (array, key) {
  const map = new Map()
  for (const row of array) {
    map.set(row[key], row)
  }
  return map
}

function calculateCumulativeWeight (names) {
  let total = 0
  for (const name of names) {
    const weight = (name.Weight || 1) * 1
    name.Weight = weight
    total = total + weight
    name.CumulativeWeight = total
  }
  return total
}

function randomName ({ names, totalWeight }, random) {
  const index = random(totalWeight)
  for (var name of names) {
    if (index < name.CumulativeWeight) {
      return name.Name
    }
  }
  return 'ack!'
}

function mapGetOrDefault (map, key, func) {
  if (!map.has(key)) {
    map.set(key, func())
  }
  return map.get(key)
}

var nameCache = new Map()

function loadNames (nameData) {
  const nameFields = ['Name', 'Weight', 'CumulativeWeight']

  return mapGetOrDefault(nameCache, nameData, function () {
    const names = applyHeadings(csvToArray(nameData), nameFields)
    const totalWeight = calculateCumulativeWeight(names)
    return {
      names: names,
      totalWeight: totalWeight
    }
  })
}

registerPatcher({
  info: info,
  gameModes: [xelib.gmFO4],
  settings: {
    label: 'A Cast of Thousands',
    templateUrl: `${patcherUrl}/partials/settings.html`,
    defaultSettings: {
      patchFileName: 'zPatch.esp',
      seed: 42,
      lvlnList: 'EditorID,Count,Rename\nLCharWorkshopNPC,1360,Y',
      maleNames: 'Name,Weight\nJames,843531\nMichael,837199\nRobert,830179\nJohn,797717\nDavid,769685\nWilliam,591080\nRichard,535279\nThomas,454252\nMark,382457\nCharles,361069\nSteven,333538\nGary,329841\nJoseph,299918\nDonald,273480\nRonald,271081\nKenneth,262735\nPaul,253109\nLarry,245623\nDaniel,243628\nStephen,207202\nDennis,204198\nTimothy,198241\nEdward,188287\nJeffrey,184587\nGeorge,180979\nGregory,178394\nKevin,158954\nDouglas,148149\nTerry,140679\nAnthony,136621\nJerry,136548\nBruce,136413\nRandy,120510\nFrank,112299\nBrian,112298\nScott,111783\nRoger,110119\nRaymond,108908\nPeter,102707\nPatrick,96821\nKeith,91197\nLawrence,91086\nWayne,88084\nDanny,86619\nAlan,83949\nGerald,82594\nRicky,79134\nCarl,78723\nChristopher,78231\nDale,75537\nWalter,72181\nCraig,69470\nWillie,66443\nJohnny,65758\nArthur,65708\nSteve,64229\nJoe,62621\nRandall,62414\nRussell,62385\nJack,62379\nHenry,62217\nHarold,62157\nRoy,61822\nAndrew,60946\nPhilip,60834\nRalph,60415\nBilly,59257\nGlenn,58701\nStanley,57136\nJimmy,54875\nRodney,54801\nBarry,54788\nSamuel,53754\nEric,53286\nBobby,53266\nAlbert,52827\nPhillip,52441\nRonnie,51290\nMartin,50972\nMike,48346\nEugene,48268\nLouis,47914\nHoward,47844\nAllen,47300\nCurtis,46303\nJeffery,45856\nFrederick,44263\nLeonard,43551\nHarry,43326\nMicheal,40923\nTony,40781\nErnest,39664\nEddie,38581\nFred,37444\nDarrell,37249\nJay,36956\nMelvin,36163\nLee,35815\nMatthew,35798\nVincent,35338\nTommy,34953\nFrancis,34761\nMarvin,34693\nDean,34563\nRick,34381\nVictor,33874\nNorman,33739\nEarl,32642\nJose,31419\nCalvin,30541\nRay,29913\nClifford,29854\nAlfred,29745\nJerome,29699\nBradley,29480\nClarence,29472\nDon,29451\nTheodore,29039\nJon,28932\nRickey,27946\nJoel,27850\nJesse,26643\nJim,26215\nEdwin,26199\nDan,26017\nChris,25885\nBernard,25881\nJonathan,25799\nGordon,25725\nGlen,25388\nJeff,24928\nWarren,24598\nLeroy,24582\nHerbert,24289\nDuane,24134\nBill,23879\nBenjamin,23833\nTom,23753\nAlvin,23079\nNicholas,22610\nTim,22219\nMitchell,21956\nMarc,21929\nLeslie,21380\nLeon,21344\nKim,21201\nDwight,20842\nBryan,20624\nLloyd,20617\nVernon,20131\nGene,19690\nReginald,19335\nLonnie,19195\nGuy,19148\nGilbert,18841\nGarry,18782\nJuan,18765\nKarl,18727\nKent,18688\nKurt,18639\nTodd,18563\nJackie,18437\nGreg,18241\nLewis,18128\nWesley,18074\nClyde,17897\nFloyd,17857\nNeil,17707\nAllan,17689\nDonnie,17161\nPerry,17074\nFranklin,17008\nLester,16562\nBrad,16478\nManuel,16369\nKirk,16217\nCarlos,15813\nLeo,15528\nJimmie,15527\nRandolph,15497\nCharlie,15279\nRobin,15215\nDana,15154\nDarryl,15086\nDave,14850\nTed,14718\nMilton,14571\nDaryl,14500\nKerry,14411\nFreddie,14403\nBrent,14325\nHarvey,14249\nGerard,14213\nStuart,14072\nJohnnie,14041\nHerman,13832\nLynn,13766\nRex,13496\nArnold,13192\nKelly,13124',
      femaleNames: 'Name,Weight\nMary,625568\nLinda,564317\nPatricia,459638\nSusan,437736\nDeborah,430519\nBarbara,345700\nDebra,341313\nKaren,332490\nNancy,286787\nDonna,270327\nCynthia,263396\nSandra,251574\nPamela,237378\nSharon,232786\nKathleen,224320\nCarol,222634\nDiane,210617\nBrenda,209231\nCheryl,171370\nJanet,167508\nElizabeth,165645\nKathy,157924\nMargaret,149572\nJanice,133606\nCarolyn,124060\nDenise,123768\nJudy,118049\nRebecca,115685\nJoyce,114962\nTeresa,114271\nChristine,113335\nCatherine,108823\nShirley,108800\nJudith,108749\nBetty,103203\nBeverly,97779\nLisa,95810\nLaura,95512\nTheresa,89599\nConnie,88804\nAnn,87035\nGloria,86698\nJulie,86689\nGail,85616\nJoan,85165\nPaula,84865\nPeggy,84285\nCindy,83974\nMartha,83180\nBonnie,83009\nJane,82917\nCathy,82712\nRobin,82417\nDebbie,82095\nDiana,80222\nMarilyn,80154\nKathryn,77801\nDorothy,74472\nWanda,72447\nJean,72262\nVicki,71977\nSheila,70168\nVirginia,69783\nSherry,68326\nKatherine,66847\nRose,66707\nLynn,66048\nJo,63953\nRuth,62524\nMaria,62430\nDarlene,61876\nJacqueline,60461\nRita,60256\nRhonda,59807\nPhyllis,57770\nHelen,57568\nVickie,56855\nKim,56076\nLori,56066\nEllen,55379\nElaine,54231\nJoanne,53551\nAnne,52385\nValerie,52229\nAlice,52063\nFrances,51194\nSuzanne,50321\nMarie,49256\nVictoria,49119\nKimberly,48951\nAnita,47587\nLaurie,46953\nMichelle,46782\nSally,46702\nTerri,46433\nMarcia,43731\nTerry,43194\nJennifer,43068\nLeslie,43042\nDoris,42896\nMaureen,42811\nWendy,42670\nMichele,41963\nAnna,41696\nMarsha,41556\nAngela,40347\nSarah,39963\nSylvia,39533\nJill,39057\nDawn,38898\nSue,38851\nEvelyn,38404\nRoberta,37914\nJeanne,37664\nCharlotte,36994\nEileen,36561\nLois,36197\nColleen,35911\nStephanie,35558\nAnnette,35340\nGlenda,35222\nYvonne,35035\nDianne,34485\nTina,33988\nBeth,33985\nLorraine,33583\nConstance,33527\nRenee,32947\nCharlene,32719\nJoann,32664\nJulia,32450\nGwendolyn,31943\nNorma,30799\nRegina,30790\nAmy,30582\nLoretta,30386\nSheryl,30381\nCarla,29428\nAndrea,29372\nTammy,29177\nIrene,26973\nJan,26163\nLouise,25848\nJuanita,25651\nMarlene,25249\nPenny,25122\nRosemary,25004\nBecky,24835\nKay,24643\nJoy,24515\nGeraldine,24219\nJeanette,23984\nGayle,23727\nAnnie,23676\nVivian,23551\nClaudia,23146\nLynda,22690\nMelissa,22289\nAudrey,22217\nLynne,22193\nPatsy,21731\nMelinda,21506\nVicky,21331\nToni,21306\nJune,21102\nBelinda,20939\nMarjorie,20937\nArlene,20653\nPatti,20602\nRuby,20550\nSara,20490\nYolanda,19945\nRosa,19876\nMelanie,19848\nChristina,19843\nDelores,19361\nJackie,19303\nVanessa,19165\nCarmen,18948\nMonica,18713\nJanis,18671\nHolly,18635\nMarianne,18477\nDolores,18307\nShelley,18224\nVeronica,17620\nMildred,17571\nEva,17108\nDana,17104\nRachel,16773\nShelia,16754\nRoxanne,16605\nCarole,16532\nLillian,16507\nJosephine,16407\nCarrie,16182\nPatty,16109\nSherri,16104\nDoreen,16086\nGrace,15918',
      familyNames: 'Name,Weight\nSmith,2501922\nJohnson,2014470\nWilliams,1738413\nJones,1544427\nBrown,1544427\nDavis,1193760\nMiller,1054488\nWilson,843093\nMoore,775944\nTaylor,773457\nAnderson,773457\nThomas,773457\nJackson,770970\nWhite,693873\nHarris,683925\nMartin,678951\nThompson,669003\nGarcia,631698\nMartinez,581958\nRobinson,579471\nClark,574497\nRodriguez,569523\nLewis,562062\nLee,547140\nWalker,544653\nHall,497400\nAllen,494913\nYoung,479991\nHernandez,477504\nKing,472530\nWright,470043\nLopez,465069\nHill,465069\nScott,460095\nGreen,455121\nAdams,432738\nBaker,425277\nGonzalez,412842\nNelson,402894\nCarter,402894\nMitchell,397920\nPerez,385485\nRoberts,380511\nTurner,378024\nPhillips,370563\nCampbell,370563\nParker,363102\nEvans,350667\nEdwards,340719\nCollins,333258\nStewart,330771\nSanchez,323310\nMorris,310875\nRogers,305901\nReed,303414\nCook,298440\nMorgan,293466\nBell,290979\nMurphy,290979\nBailey,286005\nRivera,281031\nCooper,281031\nRichardson,278544\nCox,273570\nHoward,273570\nWard,268596\nTorres,268596\nPeterson,266109\nGray,263622\nRamirez,261135\nJames,261135\nWatson,256161\nBrooks,256161\nKelly,253674\nSanders,248700\nPrice,246213\nBennett,246213\nWood,243726\nBarnes,241239\nRoss,238752\nHenderson,236265\nColeman,236265\nJenkins,236265\nPerry,233778\nPowell,231291\nLong,228804\nPatterson,228804\nHughes,228804\nFlores,228804\nWashington,228804\nButler,226317\nSimmons,226317\nFoster,226317\nGonzales,216369\nBryant,216369\nAlexander,211395\nRussell,211395\nGriffin,208908\nDiaz,208908\nHayes,206421\nMyers,206421\nFord,203934\nHamilton,203934\nGraham,203934\nSullivan,201447\nWallace,201447\nWoods,198960\nCole,198960\nWest,198960\nJordan,193986\nOwens,193986\nReynolds,193986\nFisher,191499\nEllis,191499\nHarrison,189012\nGibson,186525\nMcdonald,186525\nCruz,186525\nMarshall,186525\nOrtiz,186525\nGomez,186525\nMurray,184038\nFreeman,184038\nWells,181551\nWebb,179064\nSimpson,174090\nStevens,174090\nTucker,174090\nPorter,171603\nHunter,171603\nHicks,171603\nCrawford,169116\nHenry,169116\nBoyd,169116\nMason,169116\nMorales,166629\nKennedy,166629\nWarren,166629\nDixon,164142\nRamos,164142\nReyes,164142\nBurns,161655\nGordon,161655\nShaw,161655\nHolmes,161655\nRice,159168\nRobertson,159168\nHunt,156681\nBlack,156681\nDaniels,154194\nPalmer,154194\nMills,151707\nNichols,149220\nGrant,149220\nKnight,149220\nFerguson,146733\nRose,146733\nStone,146733\nHawkins,146733\nDunn,144246\nPerkins,144246\nHudson,144246\nSpencer,141759\nGardner,141759\nStephens,141759\nPayne,141759\nPierce,139272\nBerry,139272\nMatthews,139272\nArnold,139272\nWagner,136785\nWillis,136785\nRay,136785\nWatkins,136785\nOlson,136785\nCarroll,136785\nDuncan,136785\nSnyder,136785\nHart,134298\nCunningham,134298\nBradley,134298\nLane,134298\nAndrews,134298\nRuiz,134298\nHarper,134298\nFox,131811\nRiley,131811\nArmstrong,131811\nCarpenter,131811\nWeaver,131811\nGreene,131811\nLawrence,129324\nElliott,129324\nChavez,129324\nSims,129324\nAustin,129324\nPeters,129324\nKelley,129324\nFranklin,126837\nLawson,126837'
    }
  },
  execute: (patchFile, helpers, settings, locals) => ({
    initialize: function (patchFile, helpers, settings, locals) {
      const { logMessage, loadRecords } = helpers

      locals.maleNames = loadNames(settings.maleNames)
      locals.femaleNames = loadNames(settings.femaleNames)
      locals.familyNames = loadNames(settings.familyNames)

      const lvlns = new Map()
      const lvlnsToMultiply = locals.lvlnsToMultiply = new Map()
      const lvlnsToModify = locals.lvlnsToModify = new Map()

      for (let lvln of loadRecords('LVLN', false)) {
        lvln = GetWinningOverride(lvln)
        if (!HasElement(lvln, 'Leveled List Entries')) continue
        const edid = EditorID(lvln)
        lvlns.set(edid, {
          lvln: lvln,
          edid: edid,
          // npcs: new Set(),
          llentry: new Map(),
          count: 0
        })
      }

      const npcs = new Map()
      const npcsToRename = locals.npcsToRename = []

      function recordEntry (entry, lvlnData, npcData) {
        const { llentry } = lvlnData
        const { npcEDID } = npcData
        const { entries } = mapGetOrDefault(llentry, npcEDID, function () {
          return {
            entries: new Set(),
            newNpcs: new Set()
          }
        })
        const lvlo = GetElement(entry, 'LVLO')
        const data = {
          level: GetIntValue(lvlo, 'Level'),
          count: GetIntValue(lvlo, 'Count'),
          chanceNone: GetIntValue(lvlo, 'Chance None')
        }
        const coed = GetElement(entry, 'COED')
        if (coed) {
          data.owner = GetValue(coed, 'Owner')
          data.condition = GetValue(coed, 'Item Condition')
          if (HasElement(coed, 'Global Variable')) data.globalVariable = GetValue(coed, 'Global Variable')
          if (HasElement(coed, 'Required Rank')) data.requiredRank = GetValue(coed, 'Required Rank')
        }
        entries.add(data)
      }

      for (const i of applyHeadings(csvToArray(settings.lvlnList), ['EditorID', 'Count', 'Rename'])) {
        const edid = i.EditorID
        const lvlnData = lvlns.get(edid)
        if (!lvlnData) {
          logMessage(`[WARN] Couldn't find a LVLN named ${edid}`)
          continue
        }
        lvlns.delete(edid) // so we don't process this again below.
        const lvln = lvlnData.lvln
        const longName = lvlnData.longName = LongName(lvln)
        lvlnData.targetCount = i.Count
        const rename = lvlnData.rename = i.Rename === 'Y'
        logMessage(`Collecting the NPCs in ${longName}`)
        const npcSet = new Set()
        const npcTemplateSet = new Set()
        for (const entry of GetElements(lvln, 'Leveled List Entries')) {
          let npc = GetLinksTo(entry, 'LVLO - Base Data\\Reference')
          npc = GetWinningOverride(npc)
          const npcEDID = EditorID(npc)
          if (!HasElement(npc, 'TPLT')) {
            npcTemplateSet.add(npcEDID)
            if (rename) npcsToRename.push(npc)
            continue
          }
          const npcData = mapGetOrDefault(npcs, npcEDID, function () {
            npc = GetWinningOverride(npc)
            if (rename) npcsToRename.push(npc)
            return {
              npc: npc,
              npcEDID: npcEDID,
              lvlns: new Set(),
              flsts: new Set(),
              clones: new Set()
            }
          })
          npcSet.add(npcData)
          npcData.lvlns.add(lvlnData)
          recordEntry(entry, lvlnData, npcData)
        }
        lvlnData.npcs = npcSet
        lvlnData.count = npcSet.size + npcTemplateSet.size
        if (npcSet.size === 0) {
          logMessage('[WARN] No NPCs found to duplicate, skipping this LVLN')
          continue
        } else {
          lvlnsToMultiply.set(edid, lvlnData)
          lvlnsToModify.set(edid, lvlnData)
        }
      }

      logMessage('Finding other LVLNs that reference the NPCs we will duplicate')
      for (const [lvlnEDID, lvlnData] of lvlns) {
        const lvln = lvlnData.lvln
        let found = false
        for (const entry of GetElements(lvln, 'Leveled List Entries')) {
          const npc = GetLinksTo(entry, 'LVLO - Base Data\\Reference')
          const npcEDID = EditorID(npc)
          if (!npcs.has(npcEDID)) continue
          found = true
          const npcData = npcs.get(npcEDID)
          npcData.lvlns.add(lvlnData)
          recordEntry(entry, lvlnData, npcData)
        }
        if (found) lvlnsToModify.set(lvlnEDID, lvlnData)
      }

      const flstsToProcess = locals.flstsToProcess = new Map()

      logMessage('Finding FLSTs that reference the NPCs we will duplicate')
      for (let flst of loadRecords('FLST', false)) {
        flst = GetWinningOverride(flst)
        if (!HasElement(flst, 'FormIDs')) continue
        const edid = EditorID(flst)
        var skip = false
        const flstNpcs = new Map()
        for (var formID of GetElements(flst, 'FormIDs')) {
          const npc = GetLinksTo(formID)
          if (Signature(npc) !== 'NPC_') {
            skip = true
            break
          }
          const npcEDID = EditorID(npc)
          const npcData = npcs.get(npcEDID)
          if (npcData) flstNpcs.set(npcEDID, npcData)
        }
        if (skip) continue
        if (flstNpcs.size === 0) continue
        const flstData = {
          flst: flst,
          edid: edid,
          newNpcs: new Set()
        }
        for (const npcData of flstNpcs.values()) {
          npcData.flsts.add(flstData)
        }
        flstsToProcess.set(edid, flstData)
      }

      // TODO anything else that an NPC_ could be referenced by we should duplicate?
    },
    process: [
      {
        records: function (filesToPatch, helpers, settings, locals) {
          const records = []
          for (var lvlnData of locals.lvlnsToMultiply.values()) {
            records.push(lvlnData.lvln)
          }
          return records
        },
        patch: function (lvln, helpers, settings, locals) {
          const { logMessage, copyToPatch, cacheRecord } = helpers
          logMessage(`Duplicating the NPCs in ${LongName(lvln)}`)
          const lvlnEDID = EditorID(lvln)
          const lvlnData = locals.lvlnsToMultiply.get(lvlnEDID)
          const { npcs, targetCount, rename } = lvlnData
          let { count } = lvlnData
          const { npcsToRename } = locals

          let leastClones = 0
          let nextleastClones = npcs.values().next().value.clones.size
          while (count < targetCount) {
            for (const { npc, npcEDID, lvlns, clones, flsts } of npcs) {
              let cloneCount = clones.size
              if (cloneCount === leastClones) {
                const newEDID = `${npcEDID}_acot${cloneCount}`
                const newNPC = cacheRecord(copyToPatch(npc, true), newEDID)
                clones.add(newNPC)
                if (rename) npcsToRename.push(newNPC)
                logMessage(`Creating ${LongName(newNPC)}`)

                for (const lvln of lvlns) {
                  lvln.count = lvln.count + 1
                  lvln.llentry.get(npcEDID).newNpcs.add(newNPC)
                }
                for (const flst of flsts) {
                  flst.newNpcs.add(newNPC)
                }

                cloneCount = cloneCount + 1
                count = count + 1
                if (count >= targetCount) break
              }
              if (cloneCount < nextleastClones) {
                nextleastClones = cloneCount
              }
            }
            leastClones = nextleastClones
            nextleastClones = nextleastClones + 1
          }
        }
      },
      {
        records: function (filesToPatch, helpers, settings, locals) {
          return locals.npcsToRename
        },
        patch: function (npc, helpers, settings, locals) {
          const { logMessage } = helpers
          logMessage(`Renaming ${LongName(npc)}`)
          const random = Random(EditorID(npc), settings.seed)
          const isFemale = GetIsFemale(npc)
          var givenName
          if (isFemale) {
            givenName = randomName(locals.femaleNames, random)
          } else {
            givenName = randomName(locals.maleNames, random)
          }
          const familyName = randomName(locals.familyNames, random)
          // TODO lookup FULL from template NPC
          const newName = `${givenName} ${familyName}`
          // TODO ensure names are unique?
          AddElementValue(npc, 'FULL', newName)
        }
      },
      {
        records: function (filesToPatch, helpers, settings, locals) {
          const records = []
          for (var lvlnData of locals.lvlnsToModify.values()) {
            records.push(lvlnData.lvln)
          }
          return records
        },
        patch: function (lvln, helpers, settings, locals) {
          const { logMessage } = helpers
          logMessage(`Adding new NPC_s to ${LongName(lvln)}`)
          const lvlnEDID = EditorID(lvln)
          const { llentry } = locals.lvlnsToModify.get(lvlnEDID)
          const entrylist = GetElement(lvln, 'Leveled List Entries')
          for (const { newNpcs, entries } of llentry.values()) {
            for (const entry of entries) {
              const { level, count, chanceNone, owner, condition, globalVariable, requiredRank } = entry
              for (const npc of newNpcs) {
                const element = AddElement(entrylist, '.')
                const lvlo = AddElement(element, 'LVLO')
                SetIntValue(lvlo, 'Level', level)
                SetIntValue(lvlo, 'Count', count)
                SetLinksTo(lvlo, npc, 'Reference')
                SetIntValue(lvlo, 'Chance None', chanceNone)
                if (owner) {
                  const coed = AddElement(element, 'COED')
                  SetValue(coed, 'Owner', owner)
                  SetValue(coed, 'Item Condition', condition)
                  if (globalVariable) SetValue(coed, 'Global Variable', globalVariable)
                  if (requiredRank) SetValue(coed, 'Required Rank', requiredRank)
                }
              }
            }
          }
        }
      },
      {
        records: function (filesToPatch, helprs, settings, locals) {
          const records = []
          for (var flstData of locals.flstsToProcess.values()) {
            records.push(flstData.flst)
          }
          return records
        },
        patch: function (flst, helpers, settings, locals) {
          const { logMessage } = helpers
          logMessage(`Adding new NPC_s to ${LongName(flst)}`)
          const flstEDID = EditorID(flst)
          const { newNpcs } = locals.flstsToProcess.get(flstEDID)
          const formids = GetElement(flst, 'FormIDs')
          for (const npc of newNpcs) {
            const element = AddElement(formids, '.')
            SetLinksTo(element, npc, '')
          }
        }
      }
    ]
  })
})
