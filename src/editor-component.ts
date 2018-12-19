import * as html from '@hyperapp/html'

import {El} from './types'

export default function(content: string, oninput: Function, onClose: Function) {
  return html.div(
    {
      id: 'editor-container',
    },
    [
      html.button(
        {
          id: 'editor-close',
          onclick: (ev: Event) => onClose(),
        },
        'x'
      ),
      html.textarea(
        {
          id: 'editor',
          oninput: (ev: Event) => {
            oninput((ev.target as HTMLTextAreaElement).value)
          },
          value: content,
        }
      ),
    ]
  )
}