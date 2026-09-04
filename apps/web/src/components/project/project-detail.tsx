'use client'

import { useState, useEffect } from 'react'
import { ScanProgress } from './scan-progress'
import { BlockEditor } from './block-editor'
import { ProjectHeader } from './project-header'

export function ProjectDetail({ project }: { project: any }) {
  const isScanning = ['SCANNING', 'CLONING', 'PENDING'].includes(project.status)

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />

      {isScanning && (
        <ScanProgress
          jobId={project.scanJobId}
          projectId={project.id}
        />
      )}

      {project.status === 'READY' && project.pages.length > 0 && (
        <BlockEditor project={project} />
      )}

      {project.status === 'ERROR' && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6">
          <h3 className="font-semibold text-red-700">Erro no scan</h3>
          <p className="text-sm text-red-600 mt-1">{project.scanJob?.errorMsg}</p>
        </div>
      )}
    </div>
  )
}
