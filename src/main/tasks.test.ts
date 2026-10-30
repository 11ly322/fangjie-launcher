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

describe('TaskManager coalescing', () => {
  it('coalesces progress events across several tasks into one update', async () => {
    const manager = new TaskManager()
    const ids = Array.from({ length: 3 }, (_, index) =>
      manager.create({ kind: 'mod', title: `下载测试 ${index}` })
    )
    let emissions = 0
    manager.on('update', () => {
      emissions += 1
    })
    for (const id of ids) {
      for (let progress = 1; progress <= 8; progress += 1) {
        manager.update(id, { progress: progress * 10, detail: `进度 ${progress}` })
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(emissions).toBeLessThanOrEqual(2)
    const tasks = manager.list()
    expect(tasks).toHaveLength(3)
    expect(tasks.every((task) => task.progress === 80)).toBe(true)
  })

  it('emits terminal changes immediately for waitFor', async () => {
    const manager = new TaskManager()
    const id = manager.create({ kind: 'mod', title: '立即完成' })
    let emissions = 0
    manager.on('update', () => {
      emissions += 1
    })
    manager.finish(id)
    expect(emissions).toBe(1)
    expect(manager.get(id)?.status).toBe('success')
  })
})
