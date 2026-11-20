import { createContext, useContext, useMemo, useState } from 'react';

const ModeContext = createContext(null);

export const modes = {
  student: { id: 'student', label: 'Student' },
  teacher: { id: 'teacher', label: 'Teacher' },
  preview: { id: 'preview', label: 'Preview' },
};

export function hasTeacherControls(mode) {
  return mode === modes.teacher.id || mode === modes.preview.id;
}

export function ModeProvider({ children }) {
  const [mode, setMode] = useState(modes.student.id);
  const value = useMemo(() => ({ mode, setMode }), [mode]);

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useAppMode() {
  const context = useContext(ModeContext);
  if (!context) throw new Error('useAppMode must be used inside ModeProvider');
  return context;
}
