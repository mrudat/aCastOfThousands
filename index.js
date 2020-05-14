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
    defaultSettings: {
      patchFileName: 'zPatch.esp',
      seed: 42,
      lvlnList: 'EditorID,Count\nLCharWorkshopNPC,1360'
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

      for (const i of applyHeadings(csvToArray(settings.lvlnList), ['EditorID', 'Count'])) {
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
        logMessage(`Collecting the NPCs in ${longName}`)
        const npcSet = new Set()
        const npcTemplateSet = new Set()
        for (const entry of GetElements(lvln, 'Leveled List Entries')) {
          let npc = GetLinksTo(entry, 'LVLO - Base Data\\Reference')
          npc = GetWinningOverride(npc)
          const npcEDID = EditorID(npc)
          if (!HasElement(npc, 'TPLT')) {
            npcTemplateSet.add(npcEDID)
            continue
          }
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
          const { npcs, targetCount } = lvlnData
          let { count } = lvlnData

          let leastClones = 0
          let nextleastClones = npcs.values().next().value.clones.size
          while (count < targetCount) {
            for (const { npc, npcEDID, lvlns, clones, flsts } of npcs) {
              let cloneCount = clones.size
              if (cloneCount === leastClones) {
                const newEDID = `${npcEDID}_acot${cloneCount}`
                const newNPC = cacheRecord(copyToPatch(npc, true), newEDID)
                clones.add(newNPC)
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
