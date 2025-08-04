import { useMediaQuery } from 'react-responsive'

const isDesktopOrLaptop = useMediaQuery({
  query: '(min-width: 1224px)'
})
