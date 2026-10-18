# app/components/UserInput.tsx

- Props · type · L6-L15 — type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue' | 'role'> & { /** Controlled: pass `value` and `onValueChange`. Leave `value` out and it keeps its own text (use `name` in a plain form). */ value?: string; defaultValue?: string; onValueChange?: (value: string) => void; /** Called when a suggestion is chosen (with the username), after the text has been set. */ onPick?: (username: string) => void; /** Classes for the wrapper around the input (the dropdown is positioned against it). */ wrapperClassName?: string; };
- UserInput · function · L22-L89 — function UserInput({ value, defaultValue = '', onValueChange, onPick, wrapperClassName = 'relative', className, onKeyDown, onBlur, ...rest }: Props)
- set · function · L32-L32 — set = (v: string)
- pick · function · L51-L57 — function pick(name: string)
