import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildModelRegistryEntry,
  buildSignalJournalRecord,
} from './service.js'
import type {
  ModelProviderScorecardEntry,
  SignalJournalEntry,
} from './types.js'

describe('v4 model governance', () => {
  it('keeps low-sample models out of promoted state even with a low Brier score', () => {
    const entry: ModelProviderScorecardEntry = {
      id: 'local-probability',
      label: '本地概率模型',
      status: 'active',
      sampleSize: 8,
      qualifiedSamples: 8,
      reliability: 80,
      brierScore: 0.05,
      profitFactor: 1.4,
      weightPolicy: 'low_weight',
      summary: 'Brier 很低但样本仍不足。',
    }

    const registryEntry = buildModelRegistryEntry(entry, '2026-05-25T00:00:00.000Z')

    assert.equal(registryEntry.promoted, false)
    assert.equal(registryEntry.promotionState, 'shadow')
    assert.equal(registryEntry.eligibility.hasEnoughSamples, false)
    assert.match(registryEntry.eligibility.reasons.join('\n'), /样本/)
  })
})

describe('v4 signal journal records', () => {
  it('wraps preview entries with durable evidence and result fields', () => {
    const preview: SignalJournalEntry = {
      id: 'AU:test',
      generatedAt: '2026-05-25T00:00:00.000Z',
      quoteTimestamp: '2026-05-25T00:00:00.000Z',
      price: 720,
      action: 'watch',
      executionState: 'waiting_for_trigger',
      score: 62,
      command: '等待触发价确认',
      pattern: null,
      eventPhase: 'normal',
      sourceHealth: 'live',
      riskRewardRatio: 2.1,
      probabilityShown: false,
      outcome: 'pending',
      failureReason: 'pending',
      bucketKey: 'no_pattern:aligned:low:source_ok',
      notes: ['样本仍在沉淀。'],
    }

    const record = buildSignalJournalRecord(preview, {
      probabilityPolicyReason: '低样本，不展示精确概率。',
      displayGuards: ['等待确认'],
      sourceWarnings: [],
    }, '2026-05-25T00:00:01.000Z')

    assert.equal(record.recordVersion, 'signal-journal-record-v4')
    assert.equal(record.evidence.probabilityPolicyReason, '低样本，不展示精确概率。')
    assert.deepEqual(record.evidence.displayGuards, ['等待确认'])
    assert.equal(record.result.outcome, 'pending')
    assert.equal(record.result.failureReason, 'pending')
  })
})
