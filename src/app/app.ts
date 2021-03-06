import * as html from '@hyperapp/html'
import classNames from 'classnames'
import {Subject} from 'rxjs'

import * as Editor from '@components/editor/editor-component'
import GraphView from '@components/graph/graph-view-component'
import * as Lightbulb from '@components/lightbulb/lightbulb-component'
import * as Preview from '@components/preview/preview-component'
import * as Settings from '@components/settings/settings-component'
import * as Toolbar from '@components/toolbar/toolbar-component'
import Empty from '@components/widgets/empty'
import {initDataDirectory, writeNote} from '@lib/io'
import {getLogger} from '@lib/logger'
import * as Search from '@lib/search'
import {
  El,
  GraphNodeId,
  IGraphIndex,
  IGraphMetadata,
  IGraphNodeData,
  IPosition,
  NoteDataType,
} from '@lib/types'
import {emptyFunction} from '@lib/utils'
import {actions as graphActions} from './actions/graph'
import {
  graphActionStream,
  graphCommandObservable,
} from './actions/graph-streams'

import './app.css'

const logger = getLogger('main')

const editorOpenChange = new Subject<void>()
const editorOpenChangeObservable = editorOpenChange.asObservable()

const EDITOR_OPEN_CHANGE_OBSERVABLE_DELAY = 250

interface IState {
  graph: IGraphState
  editor: any
  settings: any
  runtime: IRuntime
  toolbar: any
  search: any
}

interface IGraphState {
  index: IGraphIndex
  metadata: IGraphMetadata
  height: number
  width: number
}

interface IRuntime {
  showEditor: boolean
  selectedNode: null | GraphNodeId,
  selectedNodeHover: {
    id: null | GraphNodeId,
    position: null | IPosition,
  }
  settingsOpen: boolean
  showPreview: boolean
  lightbulbOpen: boolean
}

export const initialState: IState = {
  toolbar: Toolbar.state,
  editor: Editor.state,
  settings: Settings.state,
  graph: {
    index: {},
    metadata: {},
    height: 0,
    width: 0,
  },
  runtime: {
    showEditor: true,
    selectedNode: null,
    selectedNodeHover: {
      id: null,
      position: null,
    },
    settingsOpen: true,
    lightbulbOpen: true,
    showPreview: false,
  },
  search: Search.state,
}

export const appActions = {
  graph: graphActions,
  editor: Editor.actions,
  toolbar: Toolbar.actions,
  settings: Settings.actions,
  search: Search.actions,

  onCreate: (el: El) => async (state: IState, actions: any) => {
    logger.debug('element created (app)', el)

    try {
      await initDataDirectory()
    } catch (err) {
      logger.error('Failed to create data directory')
    }

    actions.graph.init()
    actions.graph.handleGraphActions({
      selectNode: actions.selectNode,
      selectNodeHover: actions.selectNodeHover,
      unSelectNodeHover: actions.unSelectNodeHover,
    })
  },

  save: () => (_: IState, actions: any) => {
    logger.log('Saving application data')
    return actions.graph.save()
  },

  selectNode: (nodeId: GraphNodeId) => (state: IState) => {
    setTimeout(() => editorOpenChange.next(), EDITOR_OPEN_CHANGE_OBSERVABLE_DELAY)
    return {
      runtime: {
        ...state.runtime,
        showEditor: true,
        showPreview: false,
        selectedNode: nodeId,
      },
    }
  },

  selectNodeHover: ({nodeId, pos}: {nodeId: GraphNodeId, pos: IPosition}) =>
    (state: IState) => {
      return {
        runtime: {
          ...state.runtime,
          showPreview: true,
          showEditor: false,
          selectedNodeHover: {
            id: nodeId,
            position: pos,
          },
        },
      }
  },

  unSelectNodeHover: () => (state: IState) => {
    return {
      runtime: {
        ...state.runtime,
        showPreview: false,
        selectedNodeHover: {
          id: null,
          position: null,
        },
      },
    }
  },

  onEditorClose: () => (state: IState) => {
    setTimeout(() => editorOpenChange.next(), EDITOR_OPEN_CHANGE_OBSERVABLE_DELAY)
    return {
      runtime: {
        ...state.runtime,
        showEditor: false,
      },
    }
  },

  onEditorUpdateMetadata: (node: IGraphNodeData) => (state: IState, actions: any) => {
    actions.graph.updateNodeMetadata(node)
  },

  toggleSettingsPanel: () => (state: IState, actions: any) => {
    return {
      runtime: {
        ...state.runtime,
        settingsOpen: !state.runtime.settingsOpen,
      },
    }
  },

  toggleLightbulbPanel: () => (state: IState, actions: any) => {
    return {
      runtime: {
        ...state.runtime,
        lightbulbOpen: !state.runtime.lightbulbOpen,
      },
    }
  },

  onSearchResultClick: (node: IGraphNodeData) => (_: IState, actions: any) => {
    actions.graph.focusNode(node.id)
  },

  resetGraph: () => (_: IState, actions: any) => {
    actions.graph.resetGraph()
  },
}

export function view(state: IState, actions: any) {
  return html.div(
    {
      id: 'app',
      class: classNames({'theme-dark': state.settings.darkTheme}),
      oncreate: (el: El) => actions.onCreate(el),
      ondragover: (ev: Event) => {
        ev.preventDefault()
        ev.stopPropagation()
      },
      ondragleave: (ev: Event) => {
        ev.preventDefault()
        ev.stopPropagation()
      },
      ondrop: (ev: any, node: IGraphNodeData) => {
        ev.preventDefault()
        ev.stopPropagation()
        for (const f of ev.dataTransfer.files) {
            const reader = new FileReader()
            logger.debug('Dropped file path = ' + f.path)
            if (f.path.toLowerCase().includes('.txt')) {
            reader.readAsDataURL(f)
            reader.onloadend = () => {
              const base64Data: string = reader.result!.toString().split(',')[1]
              const fileContent = atob(base64Data)
              actions.graph.createNewNode({
                position: {x: ev.screenX, y: ev.screenY},
                parent: null,
                type: NoteDataType.TEXT,
                newNodeCallback: (nodeId: GraphNodeId) => {
                  writeNote(nodeId, NoteDataType.TEXT, fileContent)
                },
              })
            }
          } else if (f.path.toLowerCase().includes('.png')) {
            reader.readAsArrayBuffer(f)
            reader.onloadend = () => {
              const fileContent = new Buffer(reader.result! as ArrayBuffer)
              actions.graph.createNewNode({
                position: {x: ev.screenX, y: ev.screenY},
                parent: null,
                type: NoteDataType.HANDWRITING,
                newNodeCallback: (nodeId: GraphNodeId) => {
                  writeNote(nodeId, NoteDataType.HANDWRITING, fileContent)
                },
              })
            }
          }
        }
      },
    },
    [
      Toolbar.view(
        state.toolbar,
        actions.toolbar,
        {
          onBack: emptyFunction,
          onHome: actions.resetGraph,
          onSettings: actions.toggleSettingsPanel,
          onLightbulb: actions.toggleLightbulbPanel,
          onSearchResultClick: actions.onSearchResultClick,
        },
        (query: string) => actions.search.search({metadata: state.graph.metadata, query}),
      ),
      (state.runtime.settingsOpen === false)
        ? Settings.view(
            state.settings,
            actions.settings,
            actions.toggleSettingsPanel,
            actions.graph.importDirectory,
          )
        : Empty(),

      (state.runtime.lightbulbOpen === true)
        ? Lightbulb.view(
            actions.toggleLightbulbPanel,
          )
          : Empty(),
      GraphView(
        {height: state.graph.height, width: state.graph.width},
        actions.onGraphReset,
        {index: state.graph.index, metadata: state.graph.metadata},
        graphActionStream,
        actions.graph.resizeGraph,
        editorOpenChangeObservable,
        graphCommandObservable,
      ),
      (state.runtime.showEditor && state.runtime.selectedNode !== null)
        ? Editor.view(
            state.editor,
            actions.editor,
            state.graph.metadata[state.runtime.selectedNode],
            actions.onEditorClose,
            actions.onEditorUpdateMetadata,
            actions.graph.deleteNode,
            actions.selectNode,
          )
        : null as any,
      (state.runtime.showPreview && state.runtime.selectedNodeHover.id !== null)
        ? Preview.view(
            state.graph.metadata[state.runtime.selectedNodeHover.id],
            state.runtime.selectedNodeHover.position!,
          )
        : null as any,
      ],
    )
  }
