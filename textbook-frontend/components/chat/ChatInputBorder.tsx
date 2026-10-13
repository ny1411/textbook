interface ChatInputBorderProps {
    isActive: boolean;
    isAgentMode?: boolean;
}

export function ChatInputBorder({ isActive }: ChatInputBorderProps) {
    if (!isActive) return null;
    return <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[20px] border border-[#c49b75]/60" />;
}
