/* eslent-env node */
/* global xelib, registerPatcher, patcherUrl, info */

const {
  AddElement,
  EditorID,
  GetElement,
  GetElements,
  GetIntValue,
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

function mapGetOrDefault (map, key, func) {
  if (!map.has(key)) {
    map.set(key, func())
  }
  return map.get(key)
}

registerPatcher({
  info: info,
  gameModes: [xelib.gmFO4],
  settings: {
    label: 'A Cast of Thousands',
    templateUrl: `${patcherUrl}/partials/settings.html`,
    controller: function ($scope) {
      const patcherSettings = $scope.settings.aCastOfThousands

      $scope.lvlnList = patcherSettings.lvlnList

      $scope.min = Math.min

      $scope.removeList = (key) => {
        delete $scope.lvlnList[key]
      }

      $scope.addList = () => {
        $scope.lvlnList.SomeListToMultiply = 20
      }
    },
    defaultSettings: {
      patchFileName: 'zPatch.esp',
      seed: 42,
      lvlnList: {
        DLC03_LCharTrapperFace: 20,
        DLC03_LCharWorkshopNPC: 120,
        DLC04_LCharRaiderDiscipleFace: 20,
        DLC04_LCharRaiderOperatorFace: 20,
        DLC04_LCharRaiderPackFace: 20,
        DLC04LCharWorkshopRaiderA: 20,
        DLC04LCharWorkshopRaiderASpokesperson: 20,
        DLC04LCharWorkshopRaiderB: 20,
        DLC04LCharWorkshopRaiderBSpokesperson: 20,
        DLC04LCharWorkshopRaiderC: 20,
        DLC04LCharWorkshopRaiderCSpokesperson: 20,
        kgSIM_Civilians_Commonwealth: 80,
        kgSIM_Civilians_FarHarbor: 40,
        kgSIM_DefaultGenericVisitorForms: 80,
        kgSIM_LChar_IndRev_IronMineWorkerNPC: 20,
        kgSIM_LCharEnslavedSettler: 20,
        LCharBosTraitsSoldier: 20,
        LCharChildrenofAtomFaces: 20,
        LCharGunnerFaceAndGender: 20,
        LCharMinutemenFaces: 20,
        LCharRaiderFaceAndGender: 20,
        LCharRRAgentFace: 20,
        LCharTriggermanHumanFaces: 20,
        LCharWorkshopGuard: 20,
        LCharWorkshopNPC: 1280,
        simvault_Minutefans: 20,
        tkz_LCharBOSFaceAndGender: 20
      }
    }
  },
  execute: (patchFile, helpers, settings, locals) => ({
    initialize: function (patchFile, helpers, settings, locals) {
      const { logMessage, loadRecords } = helpers

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

      for (const [edid, count] of settings.lvlnList) {
        const lvlnData = lvlns.get(edid)
        if (!lvlnData) {
          logMessage(`[WARN] Couldn't find a LVLN named ${edid}`)
          continue
        }
        lvlns.delete(edid) // so we don't process this again below.
        const lvln = lvlnData.lvln
        const longName = lvlnData.longName = LongName(lvln)
        lvlnData.targetCount = count
        logMessage(`Collecting the NPCs in ${longName}`)
        const npcSet = new Set()
        const npcTemplateSet = new Set()
        for (const entry of GetElements(lvln, 'Leveled List Entries')) {
          let npc = GetLinksTo(entry, 'LVLO - Base Data\\Reference')
          npc = GetWinningOverride(npc)
          const npcEDID = EditorID(npc)
          const npcData = mapGetOrDefault(npcs, npcEDID, function () {
            npc = GetWinningOverride(npc)
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
        if (found) {
          const longName = lvlnData.longName = LongName(lvln)
          logMessage(`Found ${longName} which includes NPCs we are duplicating`)
          lvlnsToModify.set(lvlnEDID, lvlnData)
        }
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
          const lvlnEDID = EditorID(lvln)
          const lvlnData = locals.lvlnsToMultiply.get(lvlnEDID)
          const { npcs, targetCount, longName } = lvlnData
          let { count } = lvlnData

          logMessage(`Duplicating the NPCs in ${longName} ${targetCount - count} times`)

          const now = Date.now

          let progressTime = now() + 2000
          let createdCount = 0
          let leastClones = 0
          let nextleastClones = npcs.values().next().value.clones.size
          while (count < targetCount) {
            for (const { npc, npcEDID, lvlns, clones, flsts } of npcs) {
              let cloneCount = clones.size
              if (cloneCount === leastClones) {
                const newEDID = `${npcEDID}_acot${cloneCount}`
                const newNPC = cacheRecord(copyToPatch(npc, true), newEDID)
                clones.add(newNPC)

                for (const lvln of lvlns) {
                  lvln.count = lvln.count + 1
                  lvln.llentry.get(npcEDID).newNpcs.add(newNPC)
                }
                for (const flst of flsts) {
                  flst.newNpcs.add(newNPC)
                }

                createdCount = createdCount + 1
                if (now() > progressTime) {
                  logMessage(`Created ${createdCount} new NPC_s...`)
                  progressTime = now() + 2000
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
          const records = []
          for (var lvlnData of locals.lvlnsToModify.values()) {
            records.push(lvlnData.lvln)
          }
          return records
        },
        patch: function (lvln, helpers, settings, locals) {
          const { logMessage } = helpers
          const lvlnEDID = EditorID(lvln)
          const { llentry, longName } = locals.lvlnsToModify.get(lvlnEDID)
          logMessage(`Adding new NPC_s to ${longName}`)
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
