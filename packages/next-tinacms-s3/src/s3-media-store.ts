/**

*/

import type {
  Media,
  MediaList,
  MediaListOptions,
  MediaStore,
  MediaUploadOptions,
} from '@tinacms/toolkit'

import { E_UNAUTHORIZED, E_BAD_ROUTE, interpretErrorMessage } from './errors'

export class S3MediaStore implements MediaStore {
  fetchFunction = (input: RequestInfo, init?: RequestInit) => {
    return fetch(input, init)
  }
  accept = 'text/*,application/*,image/*'

  async persist(media: MediaUploadOptions[]): Promise<Media[]> {
    let newFiles: Media[] = []

    for (const item of media) {
      const { file, directory } = item
      const formData = new FormData()
      formData.append('file', file)
      formData.append('directory', directory)
      formData.append('filename', file.name)

      const res = await this.fetchFunction(`/api/s3/media`, {
        method: 'POST',
        body: formData,
      })

      if (res.status != 200) {
        const responseData = await res.json()
        throw new Error(responseData.message)
      }
      const fileRes = await res.json()
      /**
       * Images uploaded to S3 aren't instantly available via the API;
       * waiting a couple seconds here seems to ensure they show up in the next fetch.
       */
      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })
      /**
       * Format the response from S3 to match Media interface
       * Valid S3 `resource_type` values: `image`, `video`, `raw` and `auto`
       * uploading a directory is not supported as such, type is defaulted to `file`
       */

      newFiles.push(fileRes)
    }
    return newFiles
  }
  async delete(media: Media) {
    await this.fetchFunction(`/api/s3/media/${encodeURIComponent(media.id)}`, {
      method: 'DELETE',
    })
  }
  async list(options: MediaListOptions): Promise<MediaList> {
    const query = this.buildQuery(options)
    const response = await this.fetchFunction('/api/s3/media' + query)

    if (response.status == 401) {
      throw E_UNAUTHORIZED
    }
    if (response.status == 404) {
      throw E_BAD_ROUTE
    }
    if (response.status >= 500) {
      const { e } = await response.json()
      const error = interpretErrorMessage(e)
      throw error
    }
    const { items, offset } = await response.json()
    return {
      items: items.map((item) => item),
      nextOffset: offset,
    }
  }

  // @ts-ignore
  previewSrc = (publicId: string | Media): string => {
    if (typeof publicId === 'string') return publicId
    return publicId.previewSrc
  }

  parse = (img) => {
    return img.src
  }

  private buildQuery(options: MediaListOptions) {
    const params = Object.keys(options)
      .filter((key) => options[key] !== '' && options[key] !== undefined)
      .map((key) => `${key}=${options[key]}`)
      .join('&')

    return `?${params}`
  }
}
