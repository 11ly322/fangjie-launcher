import { describe, expect, it } from 'vitest'
import { TaskManager } from './tasks'

describe('TaskManager.waitFor', () => {
  it('resolves when a task succeeds', async () => {
    const manager = new TaskManager()
    const id = manager.create({ kind: 'mod', title: '安装测试模组' })
    const waiting = manager.waitFor(id)
    manager.finish(id)
    await expect(waiting).resolves.toMatchObject({ id, status: 'success' })
  })

  it('rejects with the task error when a task fails', async () => {
    const manager = new TaskManager()
    const id = manager.create({ kind: 'mod', title: '安装测试模组' })
    const waiting = manager.waitFor(id)
    manager.fail(id, '下载失败')
    await expect(waiting).rejects.toThrow('下载失败')
  })

  it('rejects a missing task', async () => {
    const manager = new TaskManager()
    await expect(manager.waitFor('missing')).rejects.toThrow('任务不存在或已被清理')
  })
})
