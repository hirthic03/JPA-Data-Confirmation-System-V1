export const saveConfirmed = (system, module, elements) => {
  localStorage.setItem(
    'confirmedElements',
    JSON.stringify({ system, module, elements })
  );
};

export const loadConfirmed = () => {
  try {
    return JSON.parse(localStorage.getItem('confirmedElements')) || {};
  } catch {
    return {};
  }
};
