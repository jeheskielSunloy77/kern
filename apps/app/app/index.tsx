import { Href, Redirect } from 'expo-router'

export default function IndexRoute() {
	return <Redirect href={'/home' as Href} />
}
