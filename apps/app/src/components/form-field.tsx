import { Input, Label, Text, YStack } from 'tamagui'

export function FormField({
	label,
	value,
	onChangeText,
	placeholder,
	secureTextEntry,
	keyboardType,
	error,
}: {
	label: string
	value: string
	onChangeText: (value: string) => void
	placeholder?: string
	secureTextEntry?: boolean
	keyboardType?: 'default' | 'email-address'
	error?: string
}) {
	return (
		<YStack gap="$2">
			<Label color="$ink">{label}</Label>
			<Input
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				secureTextEntry={secureTextEntry}
				keyboardType={keyboardType}
				autoCapitalize="none"
				backgroundColor="$backgroundSoft"
				borderColor="$borderColor"
				color="$ink"
			/>
			{error ? <Text color="$danger">{error}</Text> : null}
		</YStack>
	)
}
