import { ScrollView, View, Text } from 'react-native'

import { ScreenShell } from '../../components/screen-shell'
import { PanelCard } from '../../components/panel-card'

export function CommunityScreen() {
	return (
		<ScreenShell scroll={false}>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}>
				<View className="flex-col gap-5">
					<View className="flex-col">
						<Text className="text-kern-muted text-[10px] font-bold tracking-widest uppercase mb-1">
							Kern
						</Text>
						<Text className="font-heading text-4xl text-kern-ink">
							Reading Circle
						</Text>
					</View>

					<View className="flex-col gap-4">
						<Text className="font-heading text-2xl text-kern-ink mb-2">
							Community Exchange
						</Text>

						{/* Mocked Feed Items */}
						<FeedItem 
							action="Shared a Highlight"
							time="2 hours ago"
							bookTitle="Architecture of Silence"
							authors="Tadao Ando & Peter Zumthor"
							content="A profound exploration of how space affects our inner quiet. Finally finished this after three months of slow, intentional reading. Highly recommend for anyone looking to rethink their environment."
						/>

						<FeedItem 
							action="Update"
							time="Yesterday"
							bookTitle="The Year of Magical Thinking"
							authors="Joan Didion"
							content="Reading Progress: 72%"
						/>
						
						<FeedItem 
							action="Finished Reading"
							time="5 hours ago"
							bookTitle="In Praise of Shadows"
							authors="Jun'ichiro Tanizaki"
							content="An essential essay on aesthetics, architecture, and the appreciation of the subtle."
						/>
					</View>
				</View>
			</ScrollView>
		</ScreenShell>
	)
}

function FeedItem({ action, time, bookTitle, authors, content }: { action: string, time: string, bookTitle: string, authors: string, content: string }) {
	return (
		<PanelCard>
			<View className="flex-col gap-3">
				<View className="flex-row justify-between items-center rounded-lg">
					<Text className="text-kern-primary text-xs font-bold uppercase tracking-wide">
						{action}
					</Text>
					<Text className="text-kern-muted text-xs font-ui">
						{time}
					</Text>
				</View>
				
				<View className="flex-col gap-1">
					<Text className="font-heading text-xl text-kern-ink">
						{bookTitle}
					</Text>
					<Text className="text-kern-muted text-xs font-ui">
						{authors}
					</Text>
				</View>

				<Text className="text-kern-ink font-body text-base leading-relaxed">
					{content}
				</Text>
			</View>
		</PanelCard>
	)
}
