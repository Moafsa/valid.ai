import React from 'react'
export default function Link({ href, children, scroll, prefetch, ...rest }: any) {
  return <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
}
