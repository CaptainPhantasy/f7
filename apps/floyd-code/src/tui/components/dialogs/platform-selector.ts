import { OPEN_PLATFORMS } from '@legacy-ai/floyd-code-oauth';

import { FLOYD_CODE_GLOBAL_PLATFORM_VALUE } from '#/utils/region';

import { ChoicePickerComponent, type ChoiceOption } from './choice-picker';

const FLOYD_CODE_MAINLAND_CN_OPTION: ChoiceOption = {
  value: 'floyd-code',
  label: 'Floyd Code (floyd.com/code)',
};
const FLOYD_CODE_GLOBAL_OPTION: ChoiceOption = {
  value: FLOYD_CODE_GLOBAL_PLATFORM_VALUE,
  label: 'Floyd Code (floyd.ai/code)',
};

function platformOptions(): readonly ChoiceOption[] {
  return [
    FLOYD_CODE_MAINLAND_CN_OPTION,
    FLOYD_CODE_GLOBAL_OPTION,
    ...OPEN_PLATFORMS.map((platform) => ({ value: platform.id, label: platform.name })),
  ];
}

export interface PlatformSelectorOptions {
  readonly onSelect: (platformId: string) => void;
  readonly onCancel: () => void;
}

export class PlatformSelectorComponent extends ChoicePickerComponent {
  constructor(opts: PlatformSelectorOptions) {
    super({
      title: 'Select a platform',
      options: [...platformOptions()],
      onSelect: opts.onSelect,
      onCancel: opts.onCancel,
    });
  }
}
