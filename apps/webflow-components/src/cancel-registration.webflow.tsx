/**
 * Webflow Code Component: Cancel Registration
 *
 * Wraps CancelRegistrationWidget for the Webflow Designer. Place it on the
 * public /cancel page, which the class confirmation page and email link to
 * with `?confirmation=` filled in. Before a class's free cancellation date a
 * customer can ask Katie to cancel; after it the page only shows how to reach
 * her.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { CancelRegistrationWidget } from './CancelRegistrationWidget';

export default declareComponent(CancelRegistrationWidget, {
  name: 'Cancel Registration',
  description:
    'Class cancellation requests. A customer enters their confirmation number and email; before the free cancellation date (two weeks before the class) they can ask Katie to cancel.',
  decorators: [emotionShadowDomDecorator],
  props: {
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
  },
});
