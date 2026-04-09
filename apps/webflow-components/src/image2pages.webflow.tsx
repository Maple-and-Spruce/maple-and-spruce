/**
 * Webflow Code Component: Image2Pages
 *
 * Wraps the Image2PagesWidget for use in the Webflow Designer. Heading
 * and intro text are configurable from the Designer panel so the same
 * component can be reused across pages with different framing copy.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { Image2PagesWidget } from './Image2PagesWidget';

export default declareComponent(Image2PagesWidget, {
  name: 'Image to Pages',
  description:
    'Lets visitors upload an image (e.g. a stained glass pattern) and download a multi-page PDF tiled across as many pages as needed for printing at scale. Runs entirely in the browser.',
  decorators: [emotionShadowDomDecorator],
  props: {
    heading: props.Text({
      name: 'Heading',
      defaultValue: 'Pattern Page Tiler',
    }),
    intro: props.Text({
      name: 'Intro text',
      defaultValue:
        'Upload a stained-glass pattern (or any image) and download a printable PDF tiled across as many pages as you need.',
    }),
  },
});
